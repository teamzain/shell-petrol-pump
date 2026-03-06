"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getTodayPKT } from "@/lib/utils"

export type ManualSaleData = {
    product_id: string
    quantity: number
    unit_price: number
    payment_method: string
    customer_name?: string
    notes?: string
}

/**
 * Record a manual lubricant sale
 */
export async function recordManualSale(data: ManualSaleData) {
    const supabase = await createClient()
    const today = getTodayPKT()

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
    const totalCost = data.quantity * product.purchase_price
    const profit = totalAmount - totalCost

    // 2. Create Sale Record
    const { data: sale, error: saleError } = await supabase
        .from('manual_sales')
        .insert([{
            product_id: data.product_id,
            quantity: data.quantity,
            unit_price: data.unit_price,
            total_amount: totalAmount,
            cash_payment_amount: totalAmount,
            card_payment_amount: 0,
            payment_method: data.payment_method,
            customer_name: data.customer_name,
            profit: profit,
            notes: data.notes,
            sale_date: new Date().toISOString()
        }])
        .select()
        .single()

    if (saleError) throw new Error(saleError.message)


    // 3. Update Stock
    await supabase.rpc('decrement_product_stock', {
        p_product_id: data.product_id,
        p_quantity: data.quantity
    })

    // 4. Stock Movement
    await supabase.from('stock_movements').insert([{
        product_id: data.product_id,
        movement_type: 'sale',
        quantity: -data.quantity,
        reference: `Manual Sale - ${data.customer_name || 'Walk-in'}`
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
