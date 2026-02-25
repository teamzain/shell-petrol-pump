import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function debug() {
    console.log("Fetching company accounts with 25500 balance...")
    const { data: accounts } = await supabase.from('company_accounts').select('*').eq('current_balance', 25500)
    console.log("Accounts Found: ", accounts)

    if (accounts && accounts.length > 0) {
        console.log("Fetching transactions for account id:", accounts[0].id)
        const { data: txs, error } = await supabase.from('company_account_transactions').select('*').eq('company_account_id', accounts[0].id)
        console.log("Error:", error)
        console.log("Count:", txs?.length)
        if (txs && txs.length > 0) {
            console.log("\n--- Sample Transaction ---")
            console.log(txs[0])
        } else {
            console.log("NO TRANSACTIONS EXIST FOR THIS ACCOUNT IN THE DB.")
            console.log("This means the balance was created without a transaction record.")
        }
    }
}

debug()
