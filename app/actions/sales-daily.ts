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
    bank_account_id?: string;
    paid_to?: string;
    invoice_number?: string;
    notes?: string;
}) {
    const supabase = await createClient()

    // 1. Record the expense
    const { error: expError } = await supabase.from("daily_expenses").insert(data)
    if (expError) throw expError

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
    const { data, error } = await supabase
        .from("daily_accounts_status")
        .select("closing_cash, closing_bank")
        .lt("status_date", date)
        .order("status_date", { ascending: false })
        .limit(1)
        .maybeSingle()

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

export async function saveNozzleReadings(date: string, readings: Record<string, { opening: number, closing: number }>) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Get cash payment method fallback - typically the one with type='cash'
    const { data: cashMethod, error: methodError } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('type', 'cash')
        .eq('is_active', true)
        .maybeSingle()

    if (methodError) throw new Error(`Error finding cash payment method: ${methodError.message}`)
    if (!cashMethod) throw new Error("Default 'cash' payment method not found or inactive. Please configure it in settings.")

    for (const nozzleId in readings) {
        const item = readings[nozzleId]
        if (item.closing > item.opening) {
            const { error } = await supabase.rpc('save_daily_sale_v2', {
                p_sale_date: date,
                p_nozzle_id: nozzleId,
                p_closing_reading: item.closing,
                p_payment_method_id: cashMethod.id, // Ensure this is never undefined
                p_expected_release_date: null,
                p_user_id: user.id
            })
            if (error) throw error
        }
    }

    revalidatePath("/dashboard/sales")
    return { success: true }
}

export async function saveCardPaymentsBulk(date: string, cardEntries: Array<{
    methodId: string,
    amount: number,
    bankCardId?: string,
    supplierCardId?: string
}>) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Fetch payment methods to get types
    const { data: methods } = await supabase.from('payment_methods').select('*').eq('is_active', true)
    if (!methods) throw new Error("Could not fetch payment methods")

    for (const entry of cardEntries) {
        const { methodId, amount, bankCardId, supplierCardId } = entry
        const v_bank_card_id = bankCardId === "" ? null : bankCardId
        const v_supplier_card_id = supplierCardId === "" ? null : supplierCardId

        if (amount > 0) {
            const method = methods.find(m => m.id === methodId)
            if (method) {
                // Insert into daily_sales for card payments
                const { data: saleData, error: saleError } = await supabase.from('daily_sales').insert({
                    sale_date: date,
                    payment_method_id: methodId,
                    payment_type: method.type,
                    total_amount: amount,
                    liters_sold: 0,
                    rate_per_liter: 0,
                    card_amount: amount,
                    hold_amount: amount,
                    hold_status: 'pending',
                    bank_card_id: v_bank_card_id,
                    supplier_card_id: v_supplier_card_id,
                    created_by: user.id
                }).select('id').single()

                if (saleError) throw saleError

                // Determine hold days: either from specific card or the general method
                let holdDays = method.hold_days || 0
                if (bankCardId) {
                    const { data: card } = await supabase.from('bank_cards').select('tax_percentage').eq('id', bankCardId).single()
                    // hold_days is usually at the method level but we could have card-specific logic if needed
                }

                const relDate = new Date(date)
                relDate.setDate(relDate.getDate() + holdDays)

                const { error: holdError } = await supabase.from('card_hold_records').insert({
                    sale_id: saleData.id,
                    payment_method_id: methodId,
                    payment_type: method.type,
                    supplier_id: method.supplier_id,
                    bank_card_id: v_bank_card_id,
                    supplier_card_id: v_supplier_card_id,
                    hold_amount: amount,
                    sale_date: date,
                    expected_release_date: relDate.toISOString().split('T')[0],
                    created_by: user.id
                })
                if (holdError) throw holdError
            }
        }
    }

    revalidatePath("/dashboard/sales")
    return { success: true }
}
