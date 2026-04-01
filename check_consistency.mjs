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

async function findTableDef() {
  // Check deliveries count vs stock_movements count for type='purchase'
  const { count: delCount } = await supabase.from('deliveries').select('*', { count: 'exact', head: true });
  const { count: moveCount } = await supabase.from('stock_movements').select('*', { count: 'exact', head: true }).eq('movement_type', 'purchase');
  
  console.log('DELIVERIES COUNT:', delCount);
  console.log('PURCHASE MOVEMENTS COUNT:', moveCount);
  
  if (delCount !== moveCount) {
    console.log('DISCREPANCY DETECTED! Checking for missing movements...');
    const { data: deliveries } = await supabase.from('deliveries').select('id, delivery_number');
    const { data: movements } = await supabase.from('stock_movements').select('reference_number').eq('movement_type', 'purchase');
    
    const moveRefs = new Set((movements || []).map(m => m.reference_number));
    const missing = (deliveries || []).filter(d => !moveRefs.has(d.delivery_number));
    
    console.log('MISSING DELIVERIES IN MOVEMENTS:', JSON.stringify(missing, null, 2));
  } else {
    console.log('Counts match. Discrepancy is likely due to the report limit.');
  }
}
findTableDef();
