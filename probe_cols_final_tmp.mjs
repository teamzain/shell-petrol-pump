import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const columnsToTest = ['bank_card_id', 'supplier_card_id']
    for (const col of columnsToTest) {
        const { error: colErr } = await supabase.from('balance_transactions').select(col).limit(1)
        if (!colErr) {
            console.log(`Column ${col} exists`)
        } else {
            console.log(`Column ${col} DOES NOT exist: ${colErr.message}`)
        }
    }
}

check()
