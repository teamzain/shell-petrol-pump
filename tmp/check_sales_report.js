
const { createClient } = require('@supabase/supabase-js');
const targetDate = '2026-03-28';

async function checkStock() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Get products
    const { data: products } = await supabase.from('products').select('*');
    console.log("PRODUCTS:", products.map(p => ({ id: p.id, name: p.name })));

    // 2. Check fuel sales for the date
    const { data: fuelSales } = await supabase
        .from('daily_sales')
        .select('*')
        .eq('sale_date', targetDate);
    console.log("DAILY SALES FOR 2026-03-28:", fuelSales);

    // 3. Check manual sales for the date
    const { data: manualSales } = await supabase
        .from('manual_sales')
        .select('*')
        .eq('sale_date', targetDate);
    console.log("MANUAL SALES FOR 2026-03-28:", manualSales);

    // 4. Check nozzle readings for the date (if they are used for sales)
    const { data: nozzleReadings } = await supabase
        .from('nozzle_readings')
        .select('*')
        .eq('reading_date', targetDate);
    console.log("NOZZLE READINGS FOR 2026-03-28:", nozzleReadings);
}

checkStock();
