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

async function findTriggers() {
  const { data, error } = await supabase.rpc('get_table_triggers', { table_name: 'deliveries' });
  if (error) {
    console.log('Error fetching triggers:', error);
    // Try raw query if possible (unlikely via anon key)
  } else {
    console.log('Triggers for deliveries:', JSON.stringify(data, null, 2));
  }

  const { data: smTriggers, error: smError } = await supabase.rpc('get_table_triggers', { table_name: 'stock_movements' });
  console.log('Triggers for stock_movements:', JSON.stringify(smTriggers, null, 2));
}
findTriggers();
