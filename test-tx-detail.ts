import { createClient } from "./lib/supabase/server"
import { getTransactionDetail } from "./app/actions/suppliers"

async function test() {
    try {
        // Fetch a few IDs from both tables to test
        const supabase = await createClient()
        
        console.log("--- Testing company_account_transactions ---")
        const { data: coTx } = await supabase.from("company_account_transactions").select("id").limit(1)
        if (coTx?.[0]) {
            const result = await getTransactionDetail(coTx[0].id)
            console.log("Company Tx Result:", !!result)
        }

        console.log("--- Testing balance_transactions ---")
        const { data: bTx } = await supabase.from("balance_transactions").select("id").limit(1)
        if (bTx?.[0]) {
            const result = await getTransactionDetail(bTx[0].id)
            console.log("Balance Tx Result:", !!result)
            if (result) {
                console.log("Source Table:", result.source_table)
            }
        }
    } catch (e) {
        console.error("Test failed:", e)
    }
}

test()
