import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://fidxjegjkpilfgkbkboi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs'
)

// Test if columns already exist by trying to read them
const { data, error } = await supabase
    .from('manual_sales')
    .select('discount_type, discount_value, discount_amount')
    .limit(1)

if (error) {
    console.log('Columns do NOT exist yet. Error:', error.message)
    console.log('\n⚠️  Please run the following SQL in your Supabase SQL Editor:')
    console.log('----------------------------------------------------------')
    console.log(`
ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT NULL;
ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15, 2) DEFAULT 0;
    `)
} else {
    console.log('✅ Discount columns already exist in manual_sales!')
    console.log('Sample data:', data)
}
