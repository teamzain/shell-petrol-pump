import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase
    .from('balance_transactions')
    .select('*')
    .limit(0) // Just to get keys
  
  if (error) {
    console.error('Error:', error)
  } else {
    // If table is empty, we might not get keys.
    // Try to get one real row if any.
    const { data: realData } = await supabase.from('balance_transactions').select('*').limit(1)
    if (realData && realData.length > 0) {
        console.log('Columns from data:', Object.keys(realData[0]))
    } else {
        console.log('Table is empty. Use probe script to check individual columns.')
    }
  }
}

check()
