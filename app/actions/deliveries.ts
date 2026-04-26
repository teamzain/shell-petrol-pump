"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateTransactionDate } from "./balance"

export async function recordDelivery(formData: {
    purchase_order_id: string;
    item_index: number;
    delivered_quantity: number;
    delivery_date: string;
    company_invoice_number?: string;
    vehicle_number?: string;
    driver_name?: string;
    notes?: string;
    tank_distribution?: { tank_id: string; tank_name?: string; quantity: number }[];
    delivery_type?: 'short' | 'partial';
    original_rate?: number;
}) {
    const supabase = await createClient()

    // --- DATE VALIDATION ---
    await validateTransactionDate(formData.delivery_date)
    // -----------------------

    // 1. Get User ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Generate delivery number
    const deliveryNumber = `DEL-${Date.now()}`

    // 2. Call new Atomic Postgres Function
    const { data, error } = await supabase.rpc('record_delivery_atomic_item', {
        p_po_id: formData.purchase_order_id,
        p_item_index: formData.item_index,
        p_delivery_number: deliveryNumber,
        p_received_qty: formData.delivered_quantity,
        p_delivery_date: formData.delivery_date,
        p_invoice_number: formData.company_invoice_number,
        p_vehicle_number: formData.vehicle_number,
        p_driver_name: formData.driver_name,
        p_notes: formData.notes,
        p_user_id: user.id,
        p_tank_distribution: formData.tank_distribution || null,
        p_delivery_type: formData.delivery_type || 'short',
        p_original_rate: formData.original_rate || null
    })

    if (error) throw error

    // 4. Determine if there is a hold to return
    const { data: holdRecords } = await supabase
        .from('po_hold_records')
        .select('id, hold_amount, hold_quantity')
        .eq('delivery_id', data)
        .order('created_at', { ascending: false })
        .limit(1)

    revalidatePath("/dashboard/purchases")

    return {
        success: true,
        deliveryId: data,
        holdRecord: holdRecords && holdRecords.length > 0 ? holdRecords[0] : null
    }
}

export async function getDeliveries(filters?: {
    supplier_id?: string;
    product_type?: string;
    date_from?: string;
    date_to?: string;
    supplier_type?: 'local' | 'company';
}) {
    const supabase = await createClient()
    let query = supabase
        .from("deliveries")
        .select(`
            *,
            purchase_orders (*),
            suppliers!inner (name, supplier_type),
            po_hold_records (*)
        `)
        .order("delivery_date", { ascending: false })

    if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("supplier_id", filters.supplier_id)
    if (filters?.product_type && filters.product_type !== 'all') query = query.eq("product_type", filters.product_type)
    if (filters?.date_from) query = query.gte("delivery_date", filters.date_from)
    if (filters?.date_to) query = query.lte("delivery_date", filters.date_to)
    if (filters?.supplier_type) query = query.eq("suppliers.supplier_type", filters.supplier_type)

    const { data, error } = await query
    if (error) throw error
    return data
}

export async function getDeliveryPaymentStatus(poId: string) {
    const supabase = await createClient()

    // 1. Fetch PO to get current estimated_total and supplier_id
    const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .select("id, estimated_total, supplier_id")
        .eq("id", poId)
        .single()
        
    if (poErr || !po) throw new Error("PO not found")
    
    // 2. Fetch Supplier Ledger Debits that belong to this PO
    const { data: debits } = await supabase
        .from("company_account_transactions")
        .select("amount")
        .eq("purchase_order_id", poId)
        .eq("transaction_type", "debit")
        
    const totalDebited = debits?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
    
    const amountDue = Math.max(0, Number(po.estimated_total) - totalDebited);
    
    // 3. Get current supplier balance
    const { data: account } = await supabase
        .from("company_accounts")
        .select("id, current_balance")
        .eq("supplier_id", po.supplier_id)
        .single()
        
    const currentSupplierBalance = account ? Number(account.current_balance) : 0;
    
    return {
        amountDue,
        currentSupplierBalance,
        companyAccountId: account?.id,
        supplierId: po.supplier_id
    }
}
