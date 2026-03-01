"use server"

// Tank management server actions
import { createClient } from "@/lib/supabase/server"

export async function getTanks() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('tanks')
        .select(`
            *,
            products (name)
        `)
        .order('name', { ascending: true })

    if (error) throw error
    return data
}
