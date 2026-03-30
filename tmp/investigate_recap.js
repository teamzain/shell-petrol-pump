
const { createClient } = require('@supabase/supabase-js');
const targetDate = '2026-03-28';

async function checkData() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check po_hold_records columns
    const { data: cols } = await supabase.rpc('get_table_columns', { table_name: 'po_hold_records' }); // Assuming a helper RPC exists, or use information_schema
    // Since I can't use information_schema via RPC easily without custom function, I'll just try to select 1 record.
    const { data: poHoldSample } = await supabase.from('po_hold_records').select('*').limit(1);
    console.log("PO HOLD SAMPLE:", poHoldSample);

    // 2. Check balance_transactions for 'On Hold' (Sales)
    const { data: onHoldSales } = await supabase
        .from('balance_transactions')
        .select('amount, is_hold, transaction_type, transaction_date')
        .eq('transaction_date', targetDate)
        .eq('is_hold', true);
    console.log("ON HOLD SALES (2026-03-28):", onHoldSales);

    // 3. Check po_hold_records for the date
    // I need to know the date column name. Is it 'created_at'?
    const { data: poHolds } = await supabase
        .from('po_hold_records')
        .select('*')
        .gte('created_at', `${targetDate}T00:00:00`)
        .lte('created_at', `${targetDate}T23:59:59`);
    console.log("PO HOLDS (2026-03-28):", poHolds);
}

checkData();
