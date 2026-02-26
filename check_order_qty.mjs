import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkData() {
    console.log('--- checking table names ---')
    const { data: tables, error: tableError } = await supabase.from('stock_movements').select('count', { count: 'exact', head: true })
    if (tableError) {
        console.error('Error checking stock_movements:', tableError)
    } else {
        console.log('stock_movements row count:', tables)
    }

    console.log('\n--- checking sample data ---')
    const { data: moves, error: moveError } = await supabase
        .from('stock_movements')
        .select('product_id, movement_type, quantity, ordered_quantity, reference_number, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

    if (moveError) {
        console.error('Error fetching movements:', moveError)
    } else {
        console.log('Recent movements:')
        moves.forEach(m => {
            console.log(`${m.created_at} | ${m.movement_type} | Qty: ${m.quantity} | Ord: ${m.ordered_quantity} | Ref: ${m.reference_number}`)
        })
    }

    console.log('\n--- checking deliveries for purchases ---')
    const { data: delivs } = await supabase
        .from('deliveries')
        .select('delivery_number, quantity_ordered, delivered_quantity')
        .order('created_at', { ascending: false })
        .limit(5)

    if (delivs) {
        console.table(delivs)
    }
}

checkData()
