"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * Calculates the total cost for a given quantity of a product based on FIFO (First In First Out)
 * from the stored delivery records. Updates the remaining quantity of each consumed delivery.
 * 
 * @param productId The ID of the product being sold
 * @param quantity The quantity being sold
 * @returns The total cost of the sold quantity using FIFO
 */
export async function calculateFifoCost(productId: string, quantity: number): Promise<number> {
    const supabase = await createClient()
    let remainingToCost = quantity
    let totalCost = 0

    // Fetch all deliveries for this product that have remaining quantity > 0, ordered by oldest first
    const { data: deliveries, error } = await supabase
        .from('deliveries')
        .select('id, rate_per_liter, fifo_remaining_quantity')
        .eq('product_id', productId)
        .gt('fifo_remaining_quantity', 0)
        .order('delivery_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        console.error("FIFO Calculation Error fetching deliveries:", error)
        throw new Error("Failed to fetch delivery records for cost calculation.")
    }

    if (!deliveries || deliveries.length === 0) {
        // If no deliveries found, fallback to the product's default purchase price
        // (usually happens if stock was added without a PO)
        const { data: product } = await supabase
            .from('products')
            .select('purchase_price')
            .eq('id', productId)
            .single()
            
        return quantity * (product?.purchase_price || 0)
    }

    for (const delivery of deliveries) {
        if (remainingToCost <= 0) break

        const availableQty = Number(delivery.fifo_remaining_quantity)
        const rate = Number(delivery.rate_per_liter)
        
        const qtyToConsume = Math.min(availableQty, remainingToCost)
        totalCost += qtyToConsume * rate
        remainingToCost -= qtyToConsume
        
        // Update the delivery record
        const { error: updateError } = await supabase
            .from('deliveries')
            .update({ fifo_remaining_quantity: availableQty - qtyToConsume })
            .eq('id', delivery.id)
            
        if (updateError) {
            console.error(`Failed to update delivery quantity for ID ${delivery.id}:`, updateError)
            throw new Error("Failed to update stock batches.")
        }
    }

    // If there is still quantity to cost but no more deliveries, use the last delivery's rate
    // or the product's purchase_price to estimate the rest.
    if (remainingToCost > 0) {
        const lastRate = deliveries[deliveries.length - 1]?.rate_per_liter || 0
        totalCost += remainingToCost * Number(lastRate)
        console.warn(`Insufficient delivery records for full FIFO calculation. Costed remaining ${remainingToCost} at rate ${lastRate}`)
    }

    return totalCost
}
