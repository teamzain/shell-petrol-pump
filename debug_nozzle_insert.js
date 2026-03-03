
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInvalidUuid() {
    console.log("Testing insertion with empty string for product_id (UUID column)...");

    const payload = {
        nozzle_number: "Invalid-UUID-Test",
        dispenser_id: null,
        nozzle_side: "left",
        product_id: "", // This should cause 400 if it's a UUID column
        initial_reading: 0,
        status: "active"
    };

    const { data, error } = await supabase
        .from('nozzles')
        .insert([payload]);

    if (error) {
        console.log("CAUGHT ERROR (as expected?):");
        console.log(JSON.stringify(error, null, 2));
    } else {
        console.log("SUCCESS (unexpected):", data);
        if (data && data[0]) {
            await supabase.from('nozzles').delete().eq('id', data[0].id);
        }
    }
}

testInvalidUuid();
