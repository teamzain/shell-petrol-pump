const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSchema() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    let output = '';

    try {
        // 1. Try to get ANY row
        const { data: rows, error: readError } = await supabase.from('card_hold_records').select('*').limit(1);
        output += `Read Attempt: ${JSON.stringify({ data: rows, error: readError }, null, 2)}\n\n`;

        // 2. Try to insert empty to see missing columns
        const { error: insertError } = await supabase.from('card_hold_records').insert({}).select();
        output += `Insert Attempt (Empty): ${JSON.stringify(insertError, null, 2)}\n\n`;

        // 3. Try many common column names to see which ones are accepted
        const testColumns = ['card_type', 'payment_method', 'method', 'type', 'category', 'status', 'sale_date', 'hold_amount', 'amount', 'net_amount'];
        for (const col of testColumns) {
            const { error } = await supabase.from('card_hold_records').select(col).limit(1);
            output += `Check Column '${col}': ${error ? error.message : 'EXISTS'}\n`;
        }

    } catch (err) {
        output += `Script error: ${err.message}\n`;
    }

    fs.writeFileSync('schema_debug_output.txt', output);
    console.log('Results written to schema_debug_output.txt');
}

checkSchema();
