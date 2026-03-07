
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function checkColumn() {
    const { data, error } = await supabase.rpc('check_column_exists', {
        p_table: 'bank_accounts',
        p_column: 'account_type'
    })

    if (error) {
        // If RPC doesn't exist, try a direct query to information_schema
        const { data: cols, error: colErr } = await supabase
            .from('bank_accounts')
            .select('*')
            .limit(1)

        if (colErr) {
            console.error('Error fetching bank_accounts:', colErr)
            return
        }

        if (cols && cols.length > 0) {
            console.log('Columns in bank_accounts:', Object.keys(cols[0]))
        } else {
            console.log('No data in bank_accounts, cannot determine columns via select *')
        }
    } else {
        console.log('Column account_type exists:', data)
    }
}

checkColumn()
