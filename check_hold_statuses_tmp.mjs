import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data: counts, error } = await supabase
    .from('card_hold_records')
    .select('status', { count: 'exact', head: false })
  
  if (error) {
    console.error('Error:', error)
  } else {
    const statusCounts = counts.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1
      return acc
    }, {})
    console.log('Status counts in card_hold_records:', statusCounts)
    console.log('Total records:', counts.length)
  }
}

check()
