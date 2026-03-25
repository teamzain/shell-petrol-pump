"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getTodayPKT } from "@/lib/utils"
import { validateTransactionDate, getSystemActiveDate } from "./balance"
import { calculateFifoCost } from "./fifo-cost"

export type ManualSaleData = {
    product_id: string
    quantity: number
    unit_price: number
    payment_method: string
    customer_name?: string
    notes?: string
    paid_amount?: number
}

/**
 * Record a manual lubricant sale
 */
export async function recordManualSale(data: ManualSaleData) {
    // Use the station's active working date instead of real-world today
    const activeDate = await getSystemActiveDate()

    // --- DATE VALIDATION ---
    // This will now always pass as we are using the activeDate itself
    await validateTransactionDate(activeDate)
    // -----------------------

    const supabase = await createClient()

    // 1. Get product cost for profit calc
    const { data: product, error: pError } = await supabase
        .from('products')
        .select('purchase_price, current_stock')
        .eq('id', data.product_id)
        .single()

    if (pError) throw new Error("Product not found")
    if (product.current_stock < data.quantity) {
        throw new Error(`Insufficient stock. Available: ${product.current_stock}`)
    }

    const totalAmount = data.quantity * data.unit_price
    const totalCost = await calculateFifoCost(data.product_id, data.quantity)
    const profit = totalAmount - totalCost

    // 2. Create Sale Record (with fallback if payment columns are missing)
    let sale;
    let saleError;

    const { data: saleWithCols, error: errWithCols } = await supabase
        .from('manual_sales')
        .insert([{
            product_id: data.product_id,
            quantity: data.quantity,
            unit_price: data.unit_price,
            total_amount: totalAmount,
            payment_method: data.payment_method,
            customer_name: data.customer_name,
            profit: profit,
            notes: data.notes,
            sale_date: activeDate,
            cash_payment_amount: data.paid_amount || totalAmount,
            card_payment_amount: 0
        }])
        .select()
        .single()

    if (errWithCols && errWithCols.message.includes('column') && errWithCols.message.includes('not found')) {
        console.warn("Payment columns missing in manual_sales, falling back to basic insert")
        const { data: basicSale, error: basicErr } = await supabase
            .from('manual_sales')
            .insert([{
                product_id: data.product_id,
                quantity: data.quantity,
                unit_price: data.unit_price,
                total_amount: totalAmount,
                payment_method: data.payment_method,
                customer_name: data.customer_name,
                profit: profit,
                notes: data.notes,
                sale_date: activeDate
            }])
            .select()
            .single()
        sale = basicSale
        saleError = basicErr
    } else {
        sale = saleWithCols
        saleError = errWithCols
    }

    if (saleError) throw new Error(saleError.message)


    // 3. Update Stock
    await supabase.rpc('decrement_product_stock', {
        p_product_id: data.product_id,
        p_quantity: data.quantity
    })

    // 4. Stock Movement (Fetch fresh snapshot)
    const { data: currentProd } = await supabase
        .from('products')
        .select('current_stock')
        .eq('id', data.product_id)
        .single()

    const prevStock = currentProd?.current_stock ? currentProd.current_stock + data.quantity : product.current_stock
    const balanceAfter = currentProd?.current_stock || (product.current_stock - data.quantity)

    await supabase.from('stock_movements').insert([{
        product_id: data.product_id,
        movement_type: 'sale',
        quantity: -data.quantity,
        previous_stock: prevStock,
        balance_after: balanceAfter,
        notes: `Manual Sale - ${data.customer_name || 'Walk-in'}`
    }])

    // 5. Update Cash Balance (if cash)
    if (data.payment_method === 'cash') {
        // Note: Assuming there's a daily_operations logic to update cash
        // For now we just record it, the summary will aggregate it
    }

    revalidatePath('/dashboard/sales/manual-entry')
    revalidatePath('/dashboard/sales')

    return { success: true }
}

/**
 * Update the paid amount for an existing manual sale
 */
export async function updateManualSalePayment(saleId: string, newPaidAmount: number) {
    const supabase = await createClient()

    // 1. Update the manual sale record
    // We map 'paid_amount' from UI to 'cash_payment_amount' in DB
    const { error } = await supabase
        .from('manual_sales')
        .update({
            cash_payment_amount: newPaidAmount,
            updated_at: new Date().toISOString()
        })
        .eq('id', saleId)

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/sales/manual-entry')
    revalidatePath('/dashboard/reports') // Also revalidate reports since they show this data

    return { success: true }
}
