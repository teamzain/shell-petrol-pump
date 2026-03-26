import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function backfill() {
  console.log('Fetching pending card hold records...')
  const { data: holds, error: fetchErr } = await supabase
    .from('card_hold_records')
    .select(`
        *,
        bank_cards ( card_name ),
        supplier_cards ( card_name )
    `)
    .eq('status', 'pending')

  if (fetchErr) {
    console.error('Error fetching holds:', fetchErr)
    return
  }

  console.log(`Found ${holds?.length || 0} pending records.`)

  for (const hold of (holds || [])) {
    // Check if a balance_transaction already exists for this hold
    const { data: existingTx } = await supabase
        .from('balance_transactions')
        .select('id')
        .eq('card_hold_id', hold.id)
        .single()

    if (existingTx) {
        console.log(`Record ${hold.id} already has a ledger entry. Skipping.`)
        continue
    }

    console.log(`Processing hold ${hold.id}...`)
    
    // We can't easily call the server action from here due to Auth and complex logic
    // We'll manual insert into balance_transactions for backfill
    const cardName = hold.bank_cards?.card_name || hold.supplier_cards?.card_name || 'Card'
    
    const { error: insertErr } = await supabase
        .from('balance_transactions')
        .insert({
            transaction_type: hold.card_type === 'bank_card' ? 'add_bank' : 'transfer_to_supplier',
            amount: hold.hold_amount,
            is_hold: true,
            card_hold_id: hold.id,
            description: `Card Hold (Backfill): ${cardName}`,
            transaction_date: hold.sale_date,
            bank_card_id: hold.bank_card_id,
            supplier_card_id: hold.supplier_card_id,
        })

    if (insertErr) {
        console.error(`Failed to backfill hold ${hold.id}:`, insertErr)
    } else {
        console.log(`Successfully backfilled hold ${hold.id}`)
    }
  }
}

backfill()
