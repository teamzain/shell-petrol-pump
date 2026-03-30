import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://fidxjegjkpilfgkbkboi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs'
)

// Check all manual sales and their discount values
const { data, error } = await supabase
    .from('manual_sales')
    .select('id, sale_date, total_amount, discount_type, discount_value, discount_amount')
    .order('sale_date', { ascending: false })
    .limit(10)

if (error) {
    console.log('Error:', error.message)
} else {
    console.log('Recent manual sales:')
    console.table(data)
    
    const withDiscount = (data || []).filter(r => r.discount_amount > 0)
    console.log(`\nSales with discount: ${withDiscount.length} / ${(data || []).length}`)
    
    if (withDiscount.length === 0) {
        console.log('\n⚠️  No sales have discount_amount > 0.')
        console.log('The column is working correctly — you need to create a new sale WITH a discount to see values appear.')
    }
}
