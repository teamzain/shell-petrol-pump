import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://fidxjegjkpilfgkbkboi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs');

async function check() {
    const { data: cols1 } = await supabase.from('card_hold_records').select('*').limit(1);
    const { data: cols2 } = await supabase.from('daily_sales').select('*').limit(1);
    console.log('card_hold_records:', Object.keys(cols1[0] || {}));
    console.log('daily_sales:', Object.keys(cols2[0] || {}));
}
check();
