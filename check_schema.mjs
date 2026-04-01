import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.rpc('get_schema_columns', {});
  console.log(data ? "RPC succeeded" : "No RPC");

  // Or just try to select created_at
  const { data: d, error: e } = await supabase.from('manual_sales').select('created_at').limit(1);
  if (e) {
    console.log("No created_at in manual_sales", e.message);
  } else {
    console.log("created_at EXISTS in manual_sales");
  }
}
check();
