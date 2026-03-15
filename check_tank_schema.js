const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSchema() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    try {
        let { data: tData } = await supabase.from('tanks').select('*').limit(1);
        if (tData && tData.length > 0) {
            fs.writeFileSync('tank_schema_output.json', JSON.stringify(Object.keys(tData[0]), null, 2));
        } else {
            console.log("No tanks found");
        }
    } catch (err) {
        console.error('Script error:', err);
    }
}

checkSchema();
