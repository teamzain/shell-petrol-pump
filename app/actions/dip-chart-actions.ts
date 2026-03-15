"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateTransactionDate } from "./balance"

export type DipChartEntry = {
    dip_mm: number
    volume_liters: number
}

/**
 * Fetch all dip charts
 */
export async function getDipCharts() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('dip_charts')
        .select('*')
        .order('name')

    if (error) throw new Error(error.message)
    return data
}

/**
 * Save a dip chart and its entries
 */
export async function saveDipChart(name: string, entries: DipChartEntry[]) {
    const supabase = await createClient()

    // 1. Create or update the chart header
    const { data: chart, error: chartError } = await supabase
        .from('dip_charts')
        .insert([{ name }])
        .select()
        .single()

    if (chartError) throw new Error(chartError.message)

    // 2. Prepare entries with chart ID
    const chartEntries = entries.map(entry => ({
        dip_chart_id: chart.id,
        dip_mm: entry.dip_mm,
        volume_liters: entry.volume_liters
    }))

    // 3. Insert entries in batches if necessary (Supabase handles reasonably large sets)
    const { error: entriesError } = await supabase
        .from('dip_chart_entries')
        .insert(chartEntries)

    if (entriesError) {
        // Cleanup the chart header if entries fail
        await supabase.from('dip_charts').delete().eq('id', chart.id)
        throw new Error(entriesError.message)
    }

    revalidatePath('/dashboard/sales/dip-charts')
    return chart
}

/**
 * Link a dip chart to specific tanks
 */
export async function linkDipChartToTanks(chartId: string, tankIds: string[]) {
    const supabase = await createClient()

    // First, clear any existing links (optional, based on requirement, but here we set for specific tanks)
    const { error } = await supabase
        .from('tanks')
        .update({ dip_chart_id: chartId })
        .in('id', tankIds)

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/sales/dip-charts')
    revalidatePath('/dashboard/settings/tanks')
    return { success: true }
}

/**
 * Delete a dip chart
 */
export async function deleteDipChart(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('dip_charts')
        .delete()
        .eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/sales/dip-charts')
    return { success: true }
}

/**
 * Get tanks with their linked dip charts
 */
export async function getTanksWithCharts() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('tanks')
        .select(`
            id,
            name,
            current_level,
            dip_chart_id,
            products (name)
        `)
        .order('name')

    if (error) throw new Error(error.message)
    return data
}

/**
 * Get entries for a specific dip chart
 */
export async function getDipChartEntries(chartId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('dip_chart_entries')
        .select('*')
        .eq('dip_chart_id', chartId)
        .order('dip_mm', { ascending: true })

    if (error) throw new Error(error.message)
    return data
}
/**
 * Record tank reconciliation results and update tank levels
 */
export async function recordTankReconciliation(records: any[], date: string) {
    // --- DATE VALIDATION ---
    await validateTransactionDate(date)
    // -----------------------

    const supabase = await createClient()

    // Process each record
    for (const record of records) {
        // 1. Insert into history
        const { error: insertError } = await supabase
            .from('tank_reconciliation_records')
            .insert([{
                tank_id: record.tank_id,
                reading_date: date,
                dip_mm: record.dip_mm,
                dip_volume: record.dip_volume,
                current_stock: record.current_stock,
                gain_amount: record.gain_amount,
                loss_amount: record.loss_amount,
                actual_stock: record.actual_stock
            }])

        if (insertError) throw new Error(`Failed to record reconciliation for tank ${record.tank_id}: ${insertError.message}`)

        // 2. Update tank current level
        const { error: updateError } = await supabase
            .from('tanks')
            .update({
                current_level: record.actual_stock,
                updated_at: new Date().toISOString()
            })
            .eq('id', record.tank_id)

        if (updateError) throw new Error(`Failed to update stock for tank ${record.tank_id}: ${updateError.message}`)
    }

    revalidatePath('/dashboard/sales/nozzle-readings')
    revalidatePath('/dashboard/inventory')
    return { success: true }
}

/**
 * Fetch reconciliation history with date filtering
 */
export async function getReconciliationHistory(startDate?: string, endDate?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('tank_reconciliation_records')
        .select(`
            *,
            tanks (
                name,
                products ( name )
            )
        `)
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })

    if (startDate) {
        query = query.gte('reading_date', startDate)
    }
    if (endDate) {
        query = query.lte('reading_date', endDate)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)
    return data
}
