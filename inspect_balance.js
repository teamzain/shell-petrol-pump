const { createClient } = require("@supabase/supabase-js")
require("dotenv").config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function inspectTable() {
    const { data, error } = await supabase
        .from('daily_accounts_status')
        .select('*')
        .limit(1)

    if (error) {
        console.error("Error fetching daily_accounts_status:", error)
    } else {
        console.log("Columns:", Object.keys(data[0] || {}))
        console.log("Sample Data:", data[0])
    }
}

inspectTable()
