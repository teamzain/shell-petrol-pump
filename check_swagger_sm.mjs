import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/"/g, '');
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
});

async function getSwagger() {
  const req = await fetch(`${url}/rest/v1/?apikey=${key}`);
  const data = await req.json();
  const sm = Object.keys(data.definitions.stock_movements.properties);
  fs.writeFileSync('cols_sm.json', JSON.stringify({ sm }, null, 2));
}
getSwagger();
