
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkStockData() {
  console.log('Checking Stock Movements...');
  const { data: movements, error: movError } = await supabase
    .from('stock_movements')
    .select('*, products(name)')
    .order('movement_date', { ascending: false })
    .limit(10);

  if (movError) {
    console.error('Error fetching movements:', movError);
  } else {
    console.log('Last 10 movements:', movements);
  }

  console.log('\nChecking Tank Reconciliation...');
  const { data: dips, error: dipError } = await supabase
    .from('tank_reconciliation_records')
    .select('*, tanks(name)')
    .order('reading_date', { ascending: false })
    .limit(10);

  if (dipError) {
    console.error('Error fetching dips:', dipError);
  } else {
    console.log('Last 10 dips:', dips);
  }
}

checkStockData();
