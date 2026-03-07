const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    console.log("--- checking daily_sales columns ---");
    // Try to get one record or fail
    const { data, error } = await supabase.from('daily_sales').select('*').limit(1);
    if (error) {
        console.log("Error selecting:", error.message);
    } else if (data && data.length > 0) {
        console.log("Columns found in data:", Object.keys(data[0]).join(', '));
    } else {
        // If table is empty, try an insert factor
        const { error: insError } = await supabase.from('daily_sales').insert({ some_bogus_col_to_find_schema: 1 });
        console.log("Columns error message:", insError?.message);
    }
}

checkColumns();
