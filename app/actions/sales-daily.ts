"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateTransactionDate } from "./balance"

export type ExpenseData = {
    expense_date: string
    description: string
    amount: number
    category_id: string
    payment_method: string
    bank_account_id?: string
    paid_to?: string
    invoice_number?: string
    notes?: string
}

/**
 * Record a daily expense. 
 * Database triggers in atomic_balance_fix.sql handle the actual balance deductions.
 */
export async function saveDailyExpense(data: ExpenseData) {
    // --- DATE VALIDATION ---
    await validateTransactionDate(data.expense_date)
    // -----------------------

    const supabase = await createClient()

    const { error } = await supabase
        .from('daily_expenses')
        .insert([{
            expense_date: data.expense_date,
            description: data.description,
            amount: data.amount,
            category_id: data.category_id,
            payment_method: data.payment_method,
            bank_account_id: data.bank_account_id,
            paid_to: data.paid_to,
            invoice_number: data.invoice_number,
            notes: data.notes
        }])

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/expenses')
    revalidatePath('/dashboard/balance')

    return { success: true }
}

/**
 * Delete an expense
 */
export async function deleteDailyExpense(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('daily_expenses').delete().eq('id', id)
    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/expenses')
    revalidatePath('/dashboard/balance')
    return { success: true }
}
