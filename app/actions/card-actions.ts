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

        // 1. Fetch tax percentage for the card
        let taxPct = 0
        if (entry.card_type === 'bank_card') {
            const { data: card } = await supabase.from('bank_cards').select('tax_percentage').eq('id', entry.card_id).single()
            if (card) taxPct = card.tax_percentage
        } else {
            const { data: card } = await supabase.from('supplier_cards').select('tax_percentage').eq('id', entry.card_id).single()
            if (card) taxPct = card.tax_percentage
        }

        const taxAmount = (entry.amount * taxPct) / 100
        const netAmount = entry.amount - taxAmount

        // 2. Insert hold record using correct column names from the actual DB schema
        const { error } = await supabase.from('card_hold_records').insert({
            sale_date: entry.date,
            card_type: entry.card_type,
            payment_type: entry.card_type, // Legacy NOT NULL column — mirror card_type
            bank_card_id: entry.card_type === 'bank_card' ? entry.card_id : null,
            supplier_card_id: entry.card_type === 'shell_card' ? entry.card_id : null,
            hold_amount: entry.amount,
            tax_percentage: taxPct,
            tax_amount: taxAmount,
            net_amount: netAmount,
            status: 'pending'
        })

        if (error) throw new Error(`Failed to record ${entry.card_type} entry: ${error.message}`)
    }

    revalidatePath('/dashboard/balance')
    revalidatePath('/dashboard/sales/nozzle-readings')
    revalidatePath('/dashboard/sales/history')
    return { success: true }
}
