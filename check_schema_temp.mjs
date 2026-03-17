import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data: po, error: poErr } = await supabase.from('purchase_orders').select('*').limit(1)
  console.log('purchase_orders:', poErr || 'Success', po && po.length > 0 ? Object.keys(po[0]) : 'empty')
  
  const { data: del, error: delErr } = await supabase.from('deliveries').select('*').limit(1)
  console.log('deliveries:', delErr || 'Success', del && del.length > 0 ? Object.keys(del[0]) : 'empty')
}
check()
