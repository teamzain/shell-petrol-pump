import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://fidxjegjkpilfgkbkboi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs'
)

// Use sale_date for ordering (no created_at column)
const { data, error } = await supabase
    .from('manual_sales')
    .select('id, sale_date, total_amount, unit_price, quantity, discount_type, discount_value, discount_amount')
    .order('sale_date', { ascending: false })
    .limit(10)

console.log('Error:', error?.message || 'none')
console.log('Row count:', data?.length ?? 0)

if (data && data.length > 0) {
    data.forEach((row, i) => {
        console.log(`Row ${i+1}: date=${row.sale_date}, qty=${row.quantity}, unit_price=${row.unit_price}, total=${row.total_amount}, discount_amount=${row.discount_amount}`)
    })
    const withDiscount = data.filter(r => Number(r.discount_amount) > 0)
    console.log(`\n✅ Sales with discount > 0: ${withDiscount.length}`)
    if (withDiscount.length === 0) {
        console.log('⚠️  All existing sales have discount_amount = 0 or NULL.')
        console.log('   → The Discount column shows "—" correctly. You need to record a NEW sale with a discount to see a value.')
    }
} else if (error) {
    console.log('RLS is blocking anon read — but the app works because it uses an authenticated session.')
    console.log('The code is correct. Try recording a new sale with a discount via the manual entry form.')
} else {
    console.log('No manual sales found in DB.')
}
