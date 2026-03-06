const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    console.log("--- Testing 'amount' ---");
    const { error: err1 } = await supabase.from('card_hold_records').insert({ amount: 100, sale_date: '2026-03-07', card_type: 'bank_card', net_amount: 100 });
    console.log("Error with 'amount':", err1?.message);

    console.log("\n--- Testing 'hold_amount' ---");
    const { error: err2 } = await supabase.from('card_hold_records').insert({ hold_amount: 100, sale_date: '2026-03-07', card_type: 'bank_card', net_amount: 100 });
    console.log("Error with 'hold_amount':", err2?.message);
}

checkColumns();
