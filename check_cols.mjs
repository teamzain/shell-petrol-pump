import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

async function getCols() {
  const req = await fetch(`${url}/rest/v1/manual_sales?limit=1`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const data = await req.json();
  if (data.length > 0) {
     console.log('Columns:', Object.keys(data[0]));
  } else {
     console.log('No data to infer columns. Need to try OpenAPI.');
  }
}
getCols();
