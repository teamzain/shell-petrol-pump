"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateTransactionDate, recordBalanceTransaction } from "./balance"
import { addLedgerTransaction, validateSupplierBalance } from "./suppliers"

export async function createLocalPurchaseOrder(formData: {
    supplier_id: string;
    order_date: string;
    expected_delivery_date: string;
    po_number: string;
    notes?: string;
    payment_method: 'prepaid' | 'deferred';
    paid_amount?: number;
    payment_source?: 'cash' | 'bank';
    bank_account_id?: string;
    products: {
        product_id: string;
        product_type: "fuel" | "oil" | "other";
        ordered_quantity: number;
        unit_type: "liter" | "unit";
        rate_per_liter: number;
    }[];
}) {
    try {
        const supabase = await createClient()

        // 1. Get User
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: "Unauthorized" }

        // --- DATE VALIDATION ---
        await validateTransactionDate(formData.order_date)

        const poNumber = formData.po_number || `LPO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`

        let estimatedTotal = 0
        let totalOrderedQuantity = 0
        const items = formData.products.map(item => {
            const total = item.ordered_quantity * item.rate_per_liter
            estimatedTotal += total
            totalOrderedQuantity += item.ordered_quantity
            return {
                product_id: item.product_id,
                product_type: item.product_type,
                ordered_quantity: item.ordered_quantity,
                quantity_remaining: item.ordered_quantity,
                unit_type: item.unit_type,
                rate_per_liter: item.rate_per_liter,
                total_amount: total,
                status: 'pending'
            }
        })

        const paidAmt = Number(formData.paid_amount || 0)
        const isFullyPaid = paidAmt >= estimatedTotal
        const paymentStatus = paidAmt <= 0 ? 'unpaid' : (isFullyPaid ? 'fully_paid' : 'partially_paid')

        // 2. Insert into purchase_orders
        const firstItem = formData.products[0]
        const { data: po, error: poError } = await supabase
            .from("purchase_orders")
            .insert({
                po_number: poNumber,
                supplier_id: formData.supplier_id,
                ordered_quantity: totalOrderedQuantity,
                quantity_remaining: totalOrderedQuantity,
                product_id: firstItem.product_id,
                product_type: firstItem.product_type,
                unit_type: firstItem.unit_type,
                rate_per_liter: firstItem.rate_per_liter,
                estimated_total: estimatedTotal,
                expected_delivery_date: formData.expected_delivery_date,
                created_at: new Date(formData.order_date).toISOString(),
                notes: formData.notes,
                status: 'pending',
                items: items,
                purchase_type: 'local',
                payment_method: formData.payment_method,
                payment_status: paymentStatus,
                paid_amount: paidAmt
            })
            .select()
            .single()

        if (poError) {
            console.error("PO Insert Error:", poError)
            if (poError.code === '23505') {
                return { error: `The Purchase Order Number "${poNumber}" already exists. Please use a different PO number.` };
            }
            return { error: poError.message }
        }

        // 3. Record in Ledger & Balance
        const { data: supplierInfo } = await supabase
            .from("suppliers")
            .select("name, company_accounts(id)")
            .eq("id", formData.supplier_id)
            .single()

        const accountData = supplierInfo?.company_accounts
        const accountId = Array.isArray(accountData) ? accountData[0]?.id : (accountData as any)?.id

        if (accountId) {
            // A. Record the FULL purchase liability (Debit)
            await addLedgerTransaction({
                company_account_id: accountId,
                transaction_type: 'debit',
                amount: estimatedTotal,
                transaction_date: formData.order_date,
                reference_number: po.po_number,
                purchase_order_id: po.id,
                note: `Local Purchase Order Placed: ${totalOrderedQuantity} ${firstItem.unit_type === 'liter' ? 'liters' : 'units'}`,
                skip_date_validation: true
            })

                // Physical Balance Deduction (Wrapped in try-catch to be robust if schema mismatch)
                try {
                    await recordBalanceTransaction({
                        transaction_type: 'transfer_to_supplier',
                        amount: paidAmt,
                        description: `Paid Local Order Amount`,
                        bank_account_id: formData.payment_source === 'bank' ? formData.bank_account_id : undefined,
                        date: formData.order_date,
                        supplier_id: formData.supplier_id,
                        purchase_order_id: po.id,
                        reference_number: po.po_number
                    })
                } catch (e) {
                    console.error("Physical balance deduction failed, but proceeding with ledger record:", e)
                }

                // REMOVED manual addLedgerTransaction here because recordBalanceTransaction handles it automatically!
        }

        revalidatePath("/dashboard/local-purchases")
        return { success: true, count: 1 }
    } catch (err: any) {
        console.error("Server Action Error:", err)
        return { error: err.message || "An unexpected error occurred" }
    }
}

export async function payLocalPurchaseOrder(data: {
    po_id: string;
    amount: number;
    payment_source: 'cash' | 'bank';
    bank_account_id?: string;
    transaction_date: string;
    reference_number?: string;
    note?: string;
}) {
    try {
        const supabase = await createClient()

        // 1. Get PO details
        const { data: po, error: poErr } = await supabase
            .from("purchase_orders")
            .select("*, suppliers(name, company_accounts(id))")
            .eq("id", data.po_id)
            .single()

        if (poErr || !po) throw new Error("Purchase Order not found")
        
        const remaining = Number(po.estimated_total) - Number(po.paid_amount)
        if (data.amount > remaining) {
            throw new Error(`Payment amount (Rs. ${data.amount}) exceeds remaining balance (Rs. ${remaining})`)
        }

        // 2. Record Physical Balance Transaction (Outflow)
        // Note: recordBalanceTransaction will automatically call addLedgerTransaction internally
        await recordBalanceTransaction({
            transaction_type: 'transfer_to_supplier',
            amount: data.amount,
            description: `Paid Local Order Amount`,
            bank_account_id: data.payment_source === 'bank' ? data.bank_account_id : undefined,
            date: data.transaction_date,
            supplier_id: po.supplier_id,
            purchase_order_id: po.id,
            reference_number: data.reference_number || po.po_number
        })

        // REMOVED: manual addLedgerTransaction call to prevent duplicate entries in Statement/Ledger.

        // 4. Update PO Table
        const newPaidAmount = Number(po.paid_amount) + data.amount
        const isFullyPaid = newPaidAmount >= Number(po.estimated_total)

        const { error: upError } = await supabase
            .from("purchase_orders")
            .update({
                paid_amount: newPaidAmount,
                payment_status: isFullyPaid ? 'fully_paid' : 'partially_paid'
            })
            .eq("id", data.po_id)

        if (upError) throw upError

        revalidatePath("/dashboard/local-purchases")
        revalidatePath("/dashboard/suppliers")
        
        return { success: true }
    } catch (error: any) {
        console.error("Payment Error:", error)
        return { error: error.message || "Failed to process payment" }
    }
}
