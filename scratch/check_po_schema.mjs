import { createClient } from '@supabase/supabase-js';

const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';

const supabase = createClient(url, key);

// Try via rpc query to information_schema
const { data, error } = await supabase.rpc('exec_sql', {
  query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'purchase_orders' AND table_schema = 'public' ORDER BY ordinal_position"
});

if (error) {
  console.log('RPC error:', error.message);
  // Try alternative: call an RPC if one exists or just do a raw insert test
  // Alternatively, try the swagger endpoint properly
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    }
  });
  const text = await res.text();
  console.log('Swagger first 500 chars:', text.slice(0, 500));
} else {
  console.log('Columns:', data);
}
