"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function saveLubricantSale(data: {
    sale_date: string;
    product_id: string;
    is_loose: boolean;
    pack_size?: string;
    quantity: number;
    rate: number;
    total_amount: number;
}) {
    const supabase = await createClient()
    const { error } = await supabase.from("lubricant_sales").insert(data)
    if (error) throw error

    // Deduct stock from products
    const { error: stockError } = await supabase.rpc("decrement_product_stock", {
        p_product_id: data.product_id,
        p_quantity: data.quantity
    })

    // Fallback if rpc is not there yet
    if (stockError) {
        const { data: product } = await supabase.from("products").select("current_stock").eq("id", data.product_id).single()
        if (product) {
            await supabase.from("products").update({
                current_stock: Number(product.current_stock) - data.quantity
            }).eq("id", data.product_id)
        }
    }

    revalidatePath("/dashboard/sales")
    return { success: true }
}

export async function saveDailyExpense(data: {
    expense_date: string;
    description: string;
    amount: number;
    category?: string;
    category_id?: string;
    payment_method?: string;
    paid_to?: string;
    invoice_number?: string;
    notes?: string;
}) {
    const supabase = await createClient()
    const { error } = await supabase.from("daily_expenses").insert(data)
    if (error) throw error
    revalidatePath("/dashboard/expenses")
    revalidatePath("/dashboard/sales")
    return { success: true }
}

export async function finalizeDailySummary(date: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data, error } = await supabase.rpc("finalize_daily_status", {
        p_date: date,
        p_user_id: user.id
    })
    if (error) throw error

    revalidatePath("/dashboard/sales")
    return { success: true, id: data }
}

export async function getOpeningBalances(date: string) {
    const supabase = await createClient()
    const prevDate = new Date(date)
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = prevDate.toISOString().split('T')[0]

    const { data, error } = await supabase
        .from("daily_accounts_status")
        .select("closing_cash, closing_bank")
        .eq("status_date", prevDateStr)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error("Error fetching opening balances:", error)
    }

    return {
        opening_cash: data?.closing_cash || 0,
        opening_bank: data?.closing_bank || 0
    }
}
export async function getNozzleReadingForDate(nozzleId: string, date: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("daily_meter_readings")
        .select("closing_reading")
        .eq("nozzle_id", nozzleId)
        .eq("reading_date", date)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error("Error fetching nozzle reading:", error)
    }

    return data ? { closing_reading: Number(data.closing_reading) } : null
}
