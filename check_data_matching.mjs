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

async function checkData() {
  const { data: sm, error: smErr } = await supabase.from('stock_movements').select('*').limit(5);
  console.log('STOCK MOVEMENTS SAMPLE:');
  console.log(JSON.stringify(sm, null, 2));

  const { data: ms, error: msErr } = await supabase.from('manual_sales').select('*').limit(5);
  console.log('MANUAL SALES SAMPLE:');
  console.log(JSON.stringify(ms, null, 2));
}
checkData();
