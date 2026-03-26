"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getDispensers() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('dispensers')
        .select(`
            *,
            tanks(name),
            nozzles(
                id, nozzle_number, product_id, status,
                products(name, selling_price)
            )
        `)
        .order('name')

    if (error) {
        console.error("Error fetching dispensers:", error)
        return []
    }

    // Process sort by nozzle_number robustly
    return data.map(dispenser => {
        if (dispenser.nozzles) {
            dispenser.nozzles.sort((a: any, b: any) => Number(a.nozzle_number) - Number(b.nozzle_number))
        }
        return dispenser
    })
}

export async function saveDispenser(data: any) {
    const supabase = await createClient()

    if (data.id) {
        const { error } = await supabase
            .from('dispensers')
            .update({
                name: data.name,
                tank_id: data.tank_id || null
            })
            .eq('id', data.id)
        if (error) throw new Error(error.message)
    } else {
        const { error } = await supabase
            .from('dispensers')
            .insert({
                name: data.name,
                tank_id: data.tank_id || null
            })
        if (error) throw new Error(error.message)
    }
    revalidatePath('/dashboard/settings/dispensers')
}

export async function deleteDispenser(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('dispensers').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/dashboard/settings/dispensers')
}

export async function saveNozzle(data: any) {
    const supabase = await createClient()

    if (data.id) {
        const { error } = await supabase
            .from('nozzles')
            .update({
                dispenser_id: data.dispenser_id,
                nozzle_number: data.nozzle_number,
                product_id: data.product_id,
                status: data.status
            })
            .eq('id', data.id)
        if (error) throw new Error(error.message)
    } else {
        const { error } = await supabase
            .from('nozzles')
            .insert({
                dispenser_id: data.dispenser_id,
                nozzle_number: data.nozzle_number,
                product_id: data.product_id,
                status: data.status,
                initial_reading: 0,
                last_reading: 0
            })
        if (error) throw new Error(error.message)
    }
    revalidatePath('/dashboard/settings/dispensers')
}

export async function deleteNozzle(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('nozzles').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/dashboard/settings/dispensers')
}
