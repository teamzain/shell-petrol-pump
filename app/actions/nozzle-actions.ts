"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getTodayPKT } from "@/lib/utils"
import { validateTransactionDate } from "./balance"

export type CardPayment = {
    card_type: 'shell_card' | 'bank_card' | 'other'
    card_id?: string // bank_card_id or supplier_card_id
    amount: number
}

export type NozzleReadingUpdate = {
    nozzle_id: string
    opening_reading: number
    meter_reading: number
}

/**
 * Configure a new nozzle
 */
export async function addNozzle(formData: {
    nozzle_number: string
    product_id: string
    dispenser_id?: string
    nozzle_side?: string
    initial_reading: number
}) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('nozzles')
        .insert([{
            nozzle_number: formData.nozzle_number,
            product_id: formData.product_id,
            dispenser_id: formData.dispenser_id || null,
            nozzle_side: formData.nozzle_side,
            initial_reading: formData.initial_reading,
            last_reading: formData.initial_reading,
            current_reading: formData.initial_reading,
            status: 'active'
        }])
        .select()

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/settings/nozzles')
    return data[0]
}

/**
 * Record Multiple Nozzle Readings & Calculate Sales Automatically
 */
export async function recordNozzleReadings(readings: NozzleReadingUpdate[], date?: string) {
    const targetDate = date || getTodayPKT()

    // --- DATE VALIDATION ---
    await validateTransactionDate(targetDate)
    // -----------------------

    const supabase = await createClient()

    for (const reading of readings) {
        // 1. Get nozzle's product info
        const { data: nozzle, error: nozzleError } = await supabase
            .from('nozzles')
            .select('product_id, nozzle_number')
            .eq('id', reading.nozzle_id)
            .single()

        if (nozzleError) throw new Error(nozzleError.message)

        const openingReading = reading.opening_reading
        const quantitySold = reading.meter_reading - openingReading

        if (quantitySold < 0) {
            throw new Error(`Reading for ${nozzle.nozzle_number} (${reading.meter_reading}) cannot be less than opening reading (${openingReading}) for ${targetDate}`)
        }

        if (quantitySold >= 0) {
            // 2. Fetch Product for Financials
            const { data: product } = await supabase
                .from('products')
                .select('id, name, selling_price, purchase_price, current_stock')
                .eq('id', nozzle.product_id)
                .single()

            if (product) {
                // Check if an entry for this day already exists for this nozzle
                const { data: existingSale } = await supabase
                    .from('daily_sales')
                    .select('id, quantity')
                    .eq('nozzle_id', reading.nozzle_id)
                    .eq('sale_date', targetDate)
                    .single()

                const totalQty = quantitySold
                const totalRevenue = totalQty * product.selling_price
                const totalCogs = totalQty * product.purchase_price

                // 3. Upsert Daily Sale (Consolidated)
                const { data: saleData, error: saleError } = await supabase.from('daily_sales').upsert([{
                    nozzle_id: reading.nozzle_id,
                    sale_date: targetDate,
                    quantity: totalQty,
                    opening_reading: openingReading,
                    closing_reading: reading.meter_reading,
                    unit_price: product.selling_price,
                    revenue: totalRevenue,
                    cogs: totalCogs,
                    gross_profit: totalRevenue - totalCogs,
                    is_overnight: false,
                    payment_method: 'cash',
                    // Legacy support
                    liters_sold: totalQty,
                    rate_per_liter: product.selling_price,
                    total_amount: totalRevenue
                }], { onConflict: 'nozzle_id,sale_date' }).select().single()

                if (saleError) throw new Error(`Failed to save sale: ${saleError.message}`)


                // 4. Update Stock (Bidirectional Adjustment)
                const qtyToSubtract = existingSale ? (totalQty - existingSale.quantity) : totalQty

                if (qtyToSubtract !== 0) {
                    const rpcName = qtyToSubtract > 0 ? 'decrement_product_stock' : 'increment_product_stock'
                    const { error: stockError } = await supabase.rpc(rpcName, {
                        p_product_id: product.id,
                        p_quantity: Math.abs(qtyToSubtract)
                    })
                    if (stockError) throw new Error(`Stock update failed: ${stockError.message}`)

                    // 4b. Update specific connected tank
                    const { data: nozzleDispenser } = await supabase
                        .from('nozzles')
                        .select('dispenser_id')
                        .eq('id', reading.nozzle_id)
                        .single()

                    if (nozzleDispenser && nozzleDispenser.dispenser_id) {
                        const { data: dispenser } = await supabase
                            .from('dispensers')
                            .select('tank_ids')
                            .eq('id', nozzleDispenser.dispenser_id)
                            .single()

                        if (dispenser && dispenser.tank_ids && dispenser.tank_ids.length > 0) {
                            // Find the tank that has the matching product_id
                            const { data: matchingTanks } = await supabase
                                .from('tanks')
                                .select('id, product_id')
                                .in('id', dispenser.tank_ids)
                                .eq('product_id', product.id)
                                .limit(1)

                            if (matchingTanks && matchingTanks.length > 0) {
                                const targetTankId = matchingTanks[0].id
                                const tankRpcName = qtyToSubtract > 0 ? 'decrement_tank_stock' : 'increment_tank_stock'

                                const { error: tankStockError } = await supabase.rpc(tankRpcName, {
                                    p_tank_id: targetTankId,
                                    p_quantity: Math.abs(qtyToSubtract)
                                })

                                if (tankStockError) {
                                    console.error(`Tank stock update failed: ${tankStockError.message}`)
                                    // Non-fatal error for now, as we at least updated the main product stock
                                }
                            }
                        }
                    }

                    // 5. Stock Movement Record (Fetch fresh snapshot)
                    const { data: currentProduct } = await supabase
                        .from('products')
                        .select('current_stock')
                        .eq('id', product.id)
                        .single()

                    const prevStock = currentProduct?.current_stock ? currentProduct.current_stock + qtyToSubtract : product.current_stock
                    const balanceAfter = currentProduct?.current_stock || (product.current_stock - qtyToSubtract)

                    const { error: moveError } = await supabase.from('stock_movements').insert([{
                        product_id: product.id,
                        movement_type: 'sale',
                        quantity: -qtyToSubtract, // Negative for sale/decrement, Positive for return/increment
                        previous_stock: prevStock,
                        balance_after: balanceAfter,
                        reference_number: `Nozzle ${nozzle.nozzle_number}`,
                        notes: `Daily Reading Update - ${targetDate}${existingSale ? ' (Correction)' : ''}`
                    }])
                    if (moveError) throw new Error(`Movement record failed: ${moveError.message}`)
                }

                // 6. Save/Update Reading for history
                const { error: readError } = await supabase.from('nozzle_readings').upsert([{
                    nozzle_id: reading.nozzle_id,
                    reading_date: targetDate,
                    reading_type: 'closing',
                    meter_reading: reading.meter_reading
                }], { onConflict: 'nozzle_id,reading_date,reading_type' })
                if (readError) throw new Error(`Reading log failed: ${readError.message}`)

                // 7. Update Nozzle's master record ONLY if this is the latest reading
                if (targetDate === getTodayPKT()) {
                    const { error: nozzleUpdateError } = await supabase.from('nozzles').update({
                        last_reading: reading.meter_reading,
                        updated_at: new Date().toISOString()
                    }).eq('id', reading.nozzle_id)
                    if (nozzleUpdateError) throw new Error(`Nozzle update failed: ${nozzleUpdateError.message}`)
                }
            }
        }
    }

    revalidatePath('/dashboard/sales/nozzle-readings')
    revalidatePath('/dashboard/sales/history')
    revalidatePath('/dashboard/balance')
    return { success: true }
}

/**
 * Update an existing nozzle
 */
export async function updateNozzle(id: string, formData: {
    nozzle_number: string
    product_id: string
    dispenser_id?: string
    nozzle_side?: string
    status?: string
}) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('nozzles')
        .update({
            nozzle_number: formData.nozzle_number,
            product_id: formData.product_id,
            dispenser_id: formData.dispenser_id || null,
            nozzle_side: formData.nozzle_side,
            status: formData.status || 'active',
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/settings/nozzles')
    return data[0]
}

/**
 * Delete a nozzle
 */
export async function deleteNozzle(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('nozzles').delete().eq('id', id)
    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/settings/nozzles')
    return { success: true }
}
