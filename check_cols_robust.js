const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    try {
        // Try to insert a record with NO columns to see the error message and expected columns
        const { error } = await supabase.from('card_hold_records').insert({}).select();
        if (error) {
            console.log('FULL ERROR:', JSON.stringify(error, null, 2));
        } else {
            console.log('Wait, insert succeeded with empty object?');
        }

    } catch (err) {
        console.error('Script error:', err);
    }
}

checkSchema();
