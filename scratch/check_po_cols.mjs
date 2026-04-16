import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.trim().startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.trim().startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

async function checkCols() {
  const supabase = createClient(url, key);
  const { data, error } = await supabase.from('purchase_orders').select('*').limit(1);
  if (error) {
    console.error('Error fetching purchase_orders:', error);
    // If it fails with PGRST204 there, we might need a different approach to see columns
    // but usually select * works if the table exists.
  } else {
    if (data.length > 0) {
      console.log('Columns in purchase_orders:', Object.keys(data[0]));
    } else {
      console.log('No rows in purchase_orders. Trying empty select.');
      const { data: emptyData, error: emptyError } = await supabase.from('purchase_orders').select('*').limit(0);
      if (emptyError) console.error(emptyError);
      // PostgREST might return column info in a different way or we can just try to insert dummy.
      // Actually, if I select from a table with no rows, it still returns empty array.
    }
  }
}
checkCols();
