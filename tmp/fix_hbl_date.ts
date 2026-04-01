
import { createClient } from "@/lib/supabase/server"

async function fixHBLDate() {
    const supabase = await createClient()
    const targetDate = '2026-03-18'
    const wrongDate = '2026-04-01'

    // 1. Update Card Hold Record
    const { data: hold, error: hErr } = await supabase
        .from('card_hold_records')
        .update({ released_at: `${targetDate}T00:00:00+00:00` })
        .eq('status', 'released')
        .eq('payment_type', 'bank_card')
        .gte('released_at', wrongDate)
        .select()
        .single()

    if (hErr) {
        console.error("Hold Update Error:", hErr)
    } else {
        console.log("Hold Updated:", hold.id)
    }

    // 2. Update Balance Transaction
    const { data: tx, error: tErr } = await supabase
        .from('balance_transactions')
        .update({ transaction_date: targetDate })
        .eq('transaction_type', 'add_bank')
        .eq('transaction_date', wrongDate)
        .ilike('description', '%Settlement%')
        .select()
        .single()

    if (tErr) {
        console.error("Tx Update Error:", tErr)
    } else {
        console.log("Tx Updated:", tx.id)
    }
}

fixHBLDate().catch(console.error)
