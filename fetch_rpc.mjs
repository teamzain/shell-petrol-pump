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

async function findRPC() {
  const { data, error } = await supabase.rpc('get_rpc_definition', { rpc_name: 'record_delivery_atomic_item' });
  if (error) {
    console.log('Error fetching RPC definition:', error);
    // If get_rpc_definition doesn't exist, try another way
    const { data: data2, error: error2 } = await supabase.from('pg_proc').select('prosrc').eq('proname', 'record_delivery_atomic_item');
    console.log('RPC Definition (pg_proc):', data2?.[0]?.prosrc || 'Not found');
  } else {
    console.log('RPC Definition:', data);
  }
}
findRPC();
