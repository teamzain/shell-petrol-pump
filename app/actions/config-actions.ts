"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getPumpConfig() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('pump_config')
        .select('*')
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        throw new Error(`Failed to fetch config: ${error.message}`)
    }

    return data
}

export async function updateAdminPin(pin: string) {
    if (!pin || pin.length < 4) {
        throw new Error("PIN must be at least 4 digits")
    }

    const supabase = await createClient()

    // Check if any config exists - use * to avoid 'id' error
    const { data: configs, error: fetchError } = await supabase
        .from('pump_config')
        .select('*')
        .limit(1)

    if (fetchError) {
        throw new Error(`Database error: ${fetchError.message}`)
    }

    const existing = configs && configs.length > 0 ? configs[0] : null

    if (existing) {
        // Find a key to use for the update filter, ideally 'id' or 'pump_name'
        const keys = Object.keys(existing)
        const filterKey = keys.find(k => k === 'id' || k === 'pump_name' || k === 'contact_number') || keys[0]

        const { error } = await supabase
            .from('pump_config')
            .update({ admin_pin: pin, updated_at: new Date().toISOString() })
            .eq(filterKey, existing[filterKey])

        if (error) throw new Error(`Failed to update PIN: ${error.message}`)
    } else {
        // If it doesn't exist, we omit any specific ID and let Supabase handle it
        const { error } = await supabase
            .from('pump_config')
            .insert([{ admin_pin: pin }])

        if (error) throw new Error(`Failed to create config: ${error.message}`)
    }

    revalidatePath('/dashboard/settings')
    return { success: true }
}
