"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function recordDelivery(formData: {
    purchase_order_id: string;
    item_index: number;
    delivered_quantity: number;
    delivery_date: string;
    company_invoice_number?: string;
    vehicle_number?: string;
    driver_name?: string;
    notes?: string;
}) {
    const supabase = await createClient()

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
        p_user_id: user.id
    })

    if (error) throw error

    // Determine if there is a hold to return
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
}) {
    const supabase = await createClient()
    let query = supabase
        .from("deliveries")
        .select(`
            *,
            purchase_orders (*),
            suppliers (name),
            po_hold_records (*)
        `)
        .order("delivery_date", { ascending: false })

    if (filters?.supplier_id && filters.supplier_id !== 'all') query = query.eq("supplier_id", filters.supplier_id)
    if (filters?.product_type && filters.product_type !== 'all') query = query.eq("product_type", filters.product_type)
    if (filters?.date_from) query = query.gte("delivery_date", filters.date_from)
    if (filters?.date_to) query = query.lte("delivery_date", filters.date_to)

    const { data, error } = await query
    if (error) throw error
    return data
}
