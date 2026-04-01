import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

const supabase = createClient(url, key);

async function inspectPurchases() {
  const date = '2026-03-18';
  
  // 1. Fetch ALL deliveries for that date
  const { data: deliveries, error: delErr } = await supabase
    .from('deliveries')
    .select('id, delivery_number, delivery_date, delivered_quantity, purchase_order_id, purchase_orders(product_id, products(name))')
    .eq('delivery_date', date);
  
  console.log(`TOTAL DELIVERIES ON ${date}:`, deliveries?.length || 0);
  console.log('DELIVERIES:', JSON.stringify(deliveries, null, 2));

  // 2. Fetch corresponding stock movements
  const { data: movements, error: moveErr } = await supabase
    .from('stock_movements')
    .select('id, reference_number, quantity, movement_type, movement_date')
    .eq('movement_type', 'purchase')
    .gte('movement_date', `${date}T00:00:00`)
    .lte('movement_date', `${date}T23:59:59`);
  
  console.log(`TOTAL PURCHASE MOVEMENTS ON ${date}:`, movements?.length || 0);
  console.log('MOVEMENTS:', JSON.stringify(movements, null, 2));
}
inspectPurchases();
