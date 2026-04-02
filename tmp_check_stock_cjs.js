
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkStockData() {
  try {
    console.log('Checking Products...');
    const { data: products, error: pError } = await supabase
      .from('products')
      .select('name, current_stock')
      .eq('status', 'active');
    
    if (pError) console.error('Product error:', pError);
    else console.log('Products:', products);

    console.log('\nChecking Stock Movements...');
    const { data: movements, error: movError } = await supabase
      .from('stock_movements')
      .select('id, movement_date, movement_type, quantity')
      .order('movement_date', { ascending: false })
      .limit(5);

    if (movError) console.error('Movement error:', movError);
    else console.log('Last 5 movements:', movements);
  } catch (e) {
    console.error('Fatal error:', e);
  }
}

checkStockData();
