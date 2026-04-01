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

async function checkCounts() {
  const date = '2026-03-18';
  const { count, error } = await supabase
    .from('stock_movements')
    .select('*', { count: 'exact', head: true })
    .gte('movement_date', `${date}T00:00:00`)
    .lte('movement_date', `${date}T23:59:59`);

  console.log(`TOTAL RECORDS FOR ${date}:`, count);

  const { data: del, error: delErr } = await supabase
    .from('deliveries')
    .select(`
      id, 
      delivery_date, 
      delivered_quantity,
      purchase_orders ( products ( name ) )
    `)
    .eq('delivery_date', date);
  
  console.log(`DELIVERIES IN DB FOR ${date}:`);
  console.log(JSON.stringify(del, null, 2));

  const { data: moves, error: moveErr } = await supabase
    .from('stock_movements')
    .select('id, movement_date, movement_type, quantity, reference_number')
    .eq('movement_type', 'purchase')
    .gte('movement_date', `${date}T00:00:00`);
  
  console.log(`PURCHASE MOVEMENTS IN DB FOR ${date} (AND AFTER):`);
  console.log(JSON.stringify(moves, null, 2));
}
checkCounts();
