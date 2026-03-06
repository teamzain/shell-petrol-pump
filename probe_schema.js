const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSchema() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    let output = '';

    try {
        const testColumns = [
            'id', 'sale_date', 'sale_id', 'card_type', 'payment_type', 'type',
            'bank_card_id', 'supplier_card_id', 'amount', 'hold_amount',
            'tax_percentage', 'tax_amount', 'net_amount', 'status',
            'released_at', 'actual_release_date', 'bank_account_id',
            'created_at', 'updated_at', 'created_by'
        ];

        output += 'Probing columns for card_hold_records:\n';
        for (const col of testColumns) {
            const { error } = await supabase.from('card_hold_records').select(col).limit(1);
            output += `${col}: ${error ? 'MISSING (' + error.message + ')' : 'EXISTS'}\n`;
        }

    } catch (err) {
        output += `Script error: ${err.message}\n`;
    }

    fs.writeFileSync('schema_probe_output.txt', output);
    console.log('Results written to schema_probe_output.txt');
}

checkSchema();
