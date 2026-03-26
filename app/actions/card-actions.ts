"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type DailyCardEntry = {
    card_type: 'bank_card' | 'shell_card'
    card_id: string
    amount: number
    date: string
}

/**
 * Record multiple card payments as a daily summary.
 * This will create records in card_hold_records, which triggers
 * a reduction in closing_cash (Net Cash) for that day.
 */
export async function recordDailyCardPayments(entries: DailyCardEntry[]) {
    const supabase = await createClient()

    for (const entry of entries) {
        if (entry.amount <= 0) continue

        // 1. Fetch tax percentage and name for the card
        let taxPct = 0
        let cardName = 'Unknown Card'
        if (entry.card_type === 'bank_card') {
            const { data: card } = await supabase.from('bank_cards').select('tax_percentage, card_name').eq('id', entry.card_id).single()
            if (card) {
                taxPct = card.tax_percentage
                cardName = card.card_name
            }
        } else {
            const { data: card } = await supabase.from('supplier_cards').select('tax_percentage, card_name').eq('id', entry.card_id).single()
            if (card) {
                taxPct = card.tax_percentage
                cardName = card.card_name
            }
        }

        const taxAmount = (entry.amount * taxPct) / 100
        const netAmount = entry.amount - taxAmount

        // 2. Insert hold record
        const { data: hold, error } = await supabase.from('card_hold_records').insert({
            sale_date: entry.date,
            card_type: entry.card_type,
            payment_type: entry.card_type,
            bank_card_id: entry.card_type === 'bank_card' ? entry.card_id : null,
            supplier_card_id: entry.card_type === 'shell_card' ? entry.card_id : null,
            hold_amount: entry.amount,
            tax_percentage: taxPct,
            tax_amount: taxAmount,
            net_amount: netAmount,
            status: 'pending'
        }).select('id').single()

        if (error) throw new Error(`Failed to record ${entry.card_type} entry: ${error.message}`)

        // 3. Record in balance_transactions (Ledger) as a "Hold"
        if (hold) {
            const { recordBalanceTransaction } = await import("./balance")
            await recordBalanceTransaction({
                transaction_type: entry.card_type === 'bank_card' ? 'add_bank' : 'transfer_to_supplier',
                amount: entry.amount,
                is_hold: true,
                card_hold_id: hold.id,
                description: `Card Hold: ${cardName}`,
                date: entry.date,
                bank_card_id: entry.card_type === 'bank_card' ? entry.card_id : undefined,
                supplier_card_id: entry.card_type === 'shell_card' ? entry.card_id : undefined
            })
        }
    }

    revalidatePath('/dashboard/balance')
    revalidatePath('/dashboard/sales/nozzle-readings')
    revalidatePath('/dashboard/sales/history')
    return { success: true }
}
