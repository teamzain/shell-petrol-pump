import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function probe() {
  const { data, error } = await supabase
    .rpc('get_table_columns', { table_name: 'balance_transactions' })
  
  if (error) {
    // If RPC doesn't exist, try a direct query to information_schema if possible
    // Supabase usually doesn't allow direct SELECT on information_schema over REST
    // so we might need to try to insert a dummy record and rollback, or just check the SQL files again.
    console.error('RPC Error (expected if not defined):', error)
    
    // Fallback: try to select just one column to see if it exists
    const columnsToTest = ['id', 'is_hold', 'balance_before', 'balance_after', 'transaction_date', 'transaction_type', 'amount', 'bank_account_id', 'supplier_id', 'description', 'created_at', 'created_by']
    for (const col of columnsToTest) {
        const { error: colErr } = await supabase.from('balance_transactions').select(col).limit(1)
        if (!colErr) {
            console.log(`Column ${col} exists`)
        } else {
            console.log(`Column ${col} DOES NOT exist: ${colErr.message}`)
        }
    }
  } else {
    console.log('Columns:', data)
  }
}

probe()
