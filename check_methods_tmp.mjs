import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://fidxjegjkpilfgkbkboi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs');

async function check() {
    const { data, error } = await supabase.from('payment_methods').select('*');
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

check();
