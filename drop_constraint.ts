import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { error } = await supabase.rpc('run_sql', {
      sql: 'ALTER TABLE products DROP CONSTRAINT IF EXISTS tank_capacity_validation;'
  })
  if (error) {
      console.log("RPC failed, returning SQL constraint drop block for manual execution:")
      console.log(error)
  } else {
      console.log("Result: Success")
  }
}
run()
