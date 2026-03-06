"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getTodayPKT } from "@/lib/utils"

export type CardPayment = {
    card_type: 'shell_card' | 'bank_card' | 'other'
    card_id?: string // bank_card_id or supplier_card_id
    amount: number
}

export type NozzleReadingUpdate = {
    nozzle_id: string
    meter_reading: number
}

/**
 * Configure a new nozzle
 */
export async function addNozzle(formData: {
    nozzle_number: string
    product_id: string
    location?: string
    initial_reading: number
}) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('nozzles')
        .insert([{
            nozzle_number: formData.nozzle_number,
            product_id: formData.product_id,
            location: formData.location,
            initial_reading: formData.initial_reading,
            last_reading: formData.initial_reading,
            status: 'active'
        }])
        .select()

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/settings/nozzles')
    return data[0]
}

/**
 * Record Single Nozzle Reading & Calculate Sales Automatically
 */
export async function recordNozzleReadings(readings: NozzleReadingUpdate[]) {
    const supabase = await createClient()
    const today = getTodayPKT()

    for (const reading of readings) {
        // 1. Get nozzle's last reading and product info
        const { data: nozzle, error: nozzleError } = await supabase
            .from('nozzles')
            .select('last_reading, product_id, nozzle_number')
            .eq('id', reading.nozzle_id)
            .single()

        if (nozzleError) throw new Error(nozzleError.message)

        const quantitySold = reading.meter_reading - nozzle.last_reading

        if (quantitySold < 0) {
            throw new Error(`Reading for ${nozzle.nozzle_number} (${reading.meter_reading}) cannot be less than last reading (${nozzle.last_reading})`)
        }

        if (quantitySold > 0) {
            // 2. Fetch Product for Financials
            const { data: product } = await supabase
                .from('products')
                .select('id, name, selling_price, purchase_price')
                .eq('id', nozzle.product_id)
                .single()

            if (product) {
                // Check if an entry for this day already exists for this nozzle
                const { data: existingSale } = await supabase
                    .from('daily_sales')
                    .select('id, opening_reading, quantity, revenue, gross_profit, cogs')
                    .eq('nozzle_id', reading.nozzle_id)
                    .eq('sale_date', today)
                    .single()

                const dayOpening = existingSale ? existingSale.opening_reading : nozzle.last_reading
                const totalQty = reading.meter_reading - dayOpening
                const totalRevenue = totalQty * product.selling_price
                const totalCogs = totalQty * product.purchase_price

                // 3. Upsert Daily Sale (Consolidated)
                const { data: saleData, error: saleError } = await supabase.from('daily_sales').upsert([{
                    nozzle_id: reading.nozzle_id,
                    sale_date: today,
                    quantity: totalQty,
                    opening_reading: dayOpening,
                    closing_reading: reading.meter_reading,
                    unit_price: product.selling_price,
                    revenue: totalRevenue,
                    cogs: totalCogs,
                    gross_profit: totalRevenue - totalCogs,
                    is_overnight: false,
                    payment_method: 'cash',
                    cash_payment_amount: totalRevenue,
                    card_payment_amount: 0,
                    // Legacy support
                    liters_sold: totalQty,
                    rate_per_liter: product.selling_price,
                    total_amount: totalRevenue,
                    payment_type: 'cash'
                }], { onConflict: 'nozzle_id,sale_date' }).select().single()

                if (saleError) throw new Error(`Failed to save sale: ${saleError.message}`)


                // 4. Update Stock (Only decrement the NEW quantity)
                const qtyToSubtract = existingSale ? (totalQty - existingSale.quantity) : totalQty

                if (qtyToSubtract > 0) {
                    const { error: stockError } = await supabase.rpc('decrement_product_stock', {
                        p_product_id: product.id,
                        p_quantity: qtyToSubtract
                    })
                    if (stockError) throw new Error(`Stock update failed: ${stockError.message}`)

                    // 5. Stock Movement Record
                    const { error: moveError } = await supabase.from('stock_movements').insert([{
                        product_id: product.id,
                        movement_type: 'sale',
                        quantity: -qtyToSubtract,
                        reference: `Daily Reading Update - ${today}`
                    }])
                    if (moveError) throw new Error(`Movement record failed: ${moveError.message}`)
                }

                // 6. Save/Update Reading for history
                const { error: readError } = await supabase.from('nozzle_readings').upsert([{
                    nozzle_id: reading.nozzle_id,
                    reading_date: today,
                    reading_type: 'closing',
                    meter_reading: reading.meter_reading
                }], { onConflict: 'nozzle_id,reading_date,reading_type' })
                if (readError) throw new Error(`Reading log failed: ${readError.message}`)

                // 7. Update Nozzle's master record
                const { error: nozzleUpdateError } = await supabase.from('nozzles').update({
                    last_reading: reading.meter_reading,
                    updated_at: new Date().toISOString()
                }).eq('id', reading.nozzle_id)
                if (nozzleUpdateError) throw new Error(`Nozzle update failed: ${nozzleUpdateError.message}`)
            }
        }
    }

    revalidatePath('/dashboard/sales/nozzle-readings')
    revalidatePath('/dashboard/sales/history')
    revalidatePath('/dashboard/balance')
    return { success: true }
}
