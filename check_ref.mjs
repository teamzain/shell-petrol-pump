import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSpecificData() {
    const ref = 'DEL-1772127568537'
    console.log(`--- Checking Reference: ${ref} ---`)

    console.log('\n--- deliveries entry ---')
    const { data: deliv } = await supabase
        .from('deliveries')
        .select('delivery_number, quantity_ordered, delivered_quantity, product_id')
        .eq('delivery_number', ref)
    console.table(deliv)

    console.log('\n--- stock_movements entry ---')
    const { data: move } = await supabase
        .from('stock_movements')
        .select('movement_type, quantity, ordered_quantity, reference_number, product_id')
        .eq('reference_number', ref)
    console.table(move)
}

checkSpecificData()
