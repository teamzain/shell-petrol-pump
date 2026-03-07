const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    try {
        console.log('--- Probing daily_sales structure (totals) ---');
        const { error } = await supabase.from('daily_sales').select('total_amount, liters_sold, rate_per_liter').limit(1);

        if (error) {
            console.log('QUERY ERROR:', error.message);
        } else {
            console.log('Legacy columns exist!');
        }

    } catch (err) {
        console.error('Script error:', err);
    }
}

checkSchema();
