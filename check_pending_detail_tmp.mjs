import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase
    .from('card_hold_records')
    .select('*')
    .eq('status', 'pending')
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Pending record details:', data)
  }
}

check()
