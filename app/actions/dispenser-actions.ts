"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

/**
 * Fetch all dispensers with their linked nozzles and tanks
 */
export async function getDispensers() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('dispensers')
        .select(`
            *,
            tanks(name),
            nozzles(
                *,
                products(name, selling_price)
            )
        `)
        .order('name')

    if (error) {
        console.error("Error fetching dispensers:", error)
        throw new Error(error.message)
    }

    return data
}

/**
 * Create or update a dispenser
 */
export async function saveDispenser(dispenser: {
    id?: string
    name: string
    tank_id?: string | null
}) {
    const supabase = await createClient()

    const payload = {
        name: dispenser.name,
        tank_id: dispenser.tank_id || null,
        status: 'active'
    }

    let error
    if (dispenser.id) {
        const { error: updateError } = await supabase
            .from('dispensers')
            .update(payload)
            .eq('id', dispenser.id)
        error = updateError
    } else {
        const { error: insertError } = await supabase
            .from('dispensers')
            .insert([payload])
        error = insertError
    }

    if (error) {
        console.error("Error saving dispenser:", error)
        throw new Error(error.message)
    }

    revalidatePath('/dashboard/settings/dispensers')
    return { success: true }
}

/**
 * Delete a dispenser (cascades to nozzles usually)
 */
export async function deleteDispenser(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('dispensers')
        .delete()
        .eq('id', id)

    if (error) {
        console.error("Error deleting dispenser:", error)
        throw new Error(error.message)
    }

    revalidatePath('/dashboard/settings/dispensers')
    return { success: true }
}

/**
 * Create or update a nozzle
 */
export async function saveNozzle(nozzle: {
    id?: string
    dispenser_id: string
    nozzle_number: string
    product_id: string
    nozzle_side?: string
    status: string
}) {
    const supabase = await createClient()

    // We need to handle initial/last readings if it's a new nozzle
    // Let's check if it's an update or insert
    const payload: any = {
        dispenser_id: nozzle.dispenser_id,
        nozzle_number: nozzle.nozzle_number,
        product_id: nozzle.product_id,
        nozzle_side: nozzle.nozzle_side,
        status: nozzle.status
    }

    let error
    if (nozzle.id) {
        const { error: updateError } = await supabase
            .from('nozzles')
            .update(payload)
            .eq('id', nozzle.id)
        error = updateError
    } else {
        // For new nozzles, initialize readings to 0 if not provided
        payload.initial_reading = 0
        payload.last_reading = 0
        payload.current_reading = 0

        const { error: insertError } = await supabase
            .from('nozzles')
            .insert([payload])
        error = insertError
    }

    if (error) {
        console.error("Error saving nozzle:", error)
        throw new Error(error.message)
    }

    revalidatePath('/dashboard/settings/dispensers')
    revalidatePath('/dashboard/settings/nozzles')
    return { success: true }
}

/**
 * Delete a nozzle
 */
export async function deleteNozzle(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('nozzles')
        .delete()
        .eq('id', id)

    if (error) {
        console.error("Error deleting nozzle:", error)
        throw new Error(error.message)
    }

    revalidatePath('/dashboard/settings/dispensers')
    revalidatePath('/dashboard/settings/nozzles')
    return { success: true }
}
