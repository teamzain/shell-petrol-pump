"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getDispensers() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('dispensers')
        .select(`
      *,
      tanks (name),
      nozzles (
        *,
        products (
          id,
          name,
          selling_price
        )
      )
    `)
        .order('name', { ascending: true })

    if (error) throw error
    return data
}

export async function saveDispenser(dispenser: any) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('dispensers')
        .upsert({
            id: dispenser.id || undefined,
            name: dispenser.name,
            tank_id: dispenser.tank_id || null,
            status: dispenser.status || 'active'
        })
        .select()
        .single()

    if (error) throw error
    revalidatePath('/dashboard/settings/dispensers')
    return data
}

export async function deleteDispenser(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('dispensers')
        .delete()
        .eq('id', id)

    if (error) throw error
    revalidatePath('/dashboard/settings/dispensers')
}

export async function saveNozzle(nozzle: any) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('nozzles')
        .upsert({
            id: nozzle.id || undefined,
            dispenser_id: nozzle.dispenser_id,
            nozzle_number: parseInt(nozzle.nozzle_number),
            product_id: nozzle.product_id,
            status: nozzle.status || 'active'
        })
        .select()
        .single()

    if (error) throw error
    revalidatePath('/dashboard/settings/dispensers')
    return data
}

export async function deleteNozzle(id: string) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('nozzles')
        .delete()
        .eq('id', id)

    if (error) throw error
    revalidatePath('/dashboard/settings/dispensers')
}
