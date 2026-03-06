import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://fidxjegjkpilfgkbkboi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs');

async function migrate() {
    const { error: err1 } = await supabase.rpc('run_sql', {
        sql: `
            ALTER TABLE card_hold_records ADD COLUMN IF NOT EXISTS bank_card_id UUID REFERENCES bank_cards(id);
            ALTER TABLE card_hold_records ADD COLUMN IF NOT EXISTS supplier_card_id UUID REFERENCES supplier_cards(id);
            ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS bank_card_id UUID REFERENCES bank_cards(id);
            ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS supplier_card_id UUID REFERENCES supplier_cards(id);
        `
    });

    if (err1) {
        console.log('run_sql failed or not allowed, trying direct alter (if using service role or similar)...');
        console.error(err1);
    } else {
        console.log('Migration successful via run_sql');
    }
}

migrate();
