
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

const table = process.argv[2] || 'products';

async function checkSchema() {
    // Try to get one row first
    const { data: rowData, error: rowError } = await supabase
        .from(table)
        .select('*')
        .limit(1);

    if (rowData && rowData.length > 0) {
        console.log(`Sample ${table}:`, rowData[0]);
        console.log('Fields:', Object.keys(rowData[0]));
        return;
    }

    // If empty, try to get columns via RPC if available, or just log that it's empty
    console.log(`Table ${table} is empty or rows not reachable.`);

    // Fallback: search for column names in the provided SQL files
}

checkSchema();
