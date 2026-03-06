const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testMeterInsert() {
    console.log("Testing daily_meter_readings insert with recorded_by...");
    const { error } = await supabase.from('daily_meter_readings').insert({
        reading_date: '2026-03-05',
        nozzle_id: 'any-uuid', // Just testing schema check
        opening_reading: 0,
        closing_reading: 10,
        recorded_by: 'any-user-uuid'
    });

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log("Success!");
    }
}

testMeterInsert();
