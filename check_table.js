const { createClient } = require('@supabase/supabase-js');

async function checkTable() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    try {
        const { data, error } = await supabase.from('dip_charts').select('*').limit(1);
        if (error) {
            console.log('Error searching for table:', error.message);
        } else {
            console.log('Table exists! Data:', data);
        }
    } catch (err) {
        console.error('Fatal error:', err);
    }
}

checkTable();
