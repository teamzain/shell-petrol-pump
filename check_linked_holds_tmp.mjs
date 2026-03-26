import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase
    .from('balance_transactions')
    .select('id, card_hold_id, is_hold')
    .not('card_hold_id', 'is', null)
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Records in balance_transactions with card_hold_id:', data)
  }
}

check()
