
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking products table...');
    const { data: productsInfo, error: productsError } = await supabase
        .from('products')
        .select('*')
        .limit(1);

    if (productsError) {
        console.error('Error fetching products:', productsError);
    } else {
        console.log('Products columns:', productsInfo.length > 0 ? Object.keys(productsInfo[0]) : 'Table empty or no select access');
    }

    console.log('\nChecking stock_movements table...');
    const { data: movementsInfo, error: movementsError } = await supabase
        .from('stock_movements')
        .select('*')
        .limit(1);

    if (movementsError) {
        console.log('Stock movements table error (likely missing):', movementsError.message);
    } else {
        console.log('Stock movements columns:', movementsInfo.length > 0 ? Object.keys(movementsInfo[0]) : 'Table empty');
    }
}

checkSchema();
