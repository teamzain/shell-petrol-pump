
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';

const s = createClient(supabaseUrl, supabaseKey);

async function fixHBLDate() {
    const targetDate = '2026-03-18'
    const wrongDate = '2026-04-01'

    console.log("Updating Card Hold Record...");
    const { data: hold, error: hErr } = await s
        .from('card_hold_records')
        .update({ released_at: `${targetDate}T00:00:00+00:00` })
        .eq('status', 'released')
        .eq('payment_type', 'bank_card')
        .gte('released_at', '2026-04-01')
        .select()

    if (hErr) {
        console.error("Hold Update Error:", hErr);
    } else {
        console.log("Holds Updated:", hold?.length || 0);
    }

    console.log("Updating Balance Transaction...");
    const { data: tx, error: tErr } = await s
        .from('balance_transactions')
        .update({ transaction_date: targetDate })
        .eq('transaction_type', 'add_bank')
        .eq('transaction_date', wrongDate)
        .ilike('description', '%Settlement%')
        .select()

    if (tErr) {
        console.error("Tx Update Error:", tErr);
    } else {
        console.log("Txs Updated:", tx?.length || 0);
    }
}

fixHBLDate().catch(console.error);
