const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    try {
        console.log('--- Checking DAILY_SALES ---');
        const { error: error1 } = await supabase.from('daily_sales').insert({}).select();
        if (error1) {
            console.log('DAILY_SALES ERROR:', JSON.stringify(error1, null, 2));
        }

        console.log('--- Checking DAILY_SALES (select 1) ---');
        const { data, error: error2 } = await supabase.from('daily_sales').select('*').limit(1);
        if (data && data.length > 0) {
            console.log('DAILY_SALES KEYS:', Object.keys(data[0]));
        } else {
            console.log('No data in daily_sales to check keys.');
        }

    } catch (err) {
        console.error('Script error:', err);
    }
}

checkSchema();
