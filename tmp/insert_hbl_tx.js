
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';

const s = createClient(supabaseUrl, supabaseKey);

async function insertMissingHBLTx() {
    const targetDate = '2026-03-18'
    const holdId = 'c65d98d3-3bf7-45fb-b430-495e105543bb'
    const bankId = 'fa3ca1ba-3e7a-4d7e-8d4c-0f7076c28db6'

    console.log("Inserting Missing HBL Settlement Transaction...");
    const { data: tx, error: tErr } = await s
        .from('balance_transactions')
        .insert({
            transaction_date: targetDate,
            transaction_type: 'add_bank',
            amount: 400,
            bank_account_id: bankId,
            description: 'Card Settlement: hbl card (Hold ID: c65d98d3-3bf7-45fb-b430-495e105543bb)',
            is_opening: false,
            is_hold: false,
            card_hold_id: holdId,
            created_by: 'ffeb8656-5936-4e65-8f1c-973a3fadefa2' // User ID from logs
        })
        .select()

    if (tErr) {
        console.error("Tx Insert Error:", tErr);
    } else {
        console.log("Tx Inserted:", tx?.[0]?.id);
    }
}

insertMissingHBLTx().catch(console.error);
