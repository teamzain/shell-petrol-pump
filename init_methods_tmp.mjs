import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://fidxjegjkpilfgkbkboi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs');

async function init() {
    const { data: existing, error: checkError } = await supabase.from('payment_methods').select('*');
    if (checkError) throw checkError;

    if (existing && existing.length > 0) {
        console.log('Payment methods already exist:', existing.length);
        return;
    }

    const { error: insertError } = await supabase.from('payment_methods').insert([
        { name: 'Cash', type: 'cash', hold_days: 0, is_active: true },
        { name: 'Bank Card', type: 'bank_card', hold_days: 3, is_active: true },
        { name: 'Shell Card', type: 'shell_card', hold_days: 2, is_active: true }
    ]);

    if (insertError) {
        console.error('Insert error:', insertError);
    } else {
        console.log('Default payment methods initialized successfully.');
    }
}

init();
