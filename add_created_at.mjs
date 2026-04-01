import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

// Note: we need the service role key or we can't alter tables if RLS/permissions block it. Wait, actually we can just use the supabase CLI if it's there. Let's look for service role.
// Actually, service role key might be NEXT_PUBLIC_SUPABASE_URL? No, SUPABASE_SERVICE_ROLE_KEY is usually in .env.local! Let's read the whole file!
