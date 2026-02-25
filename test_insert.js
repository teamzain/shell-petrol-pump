
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const productData = {
        name: 'Test Fuel ' + Date.now(),
        category: "Fuel",
        unit: "liters",
        tank_capacity: 10000,
        current_stock: 5000,
        min_stock_level: 1000,
        purchase_price: 250,
        selling_price: 260,
    };

    console.log('Attempting to insert product:', productData);

    const { data: newProduct, error: insertError } = await supabase
        .from("products")
        .insert(productData)
        .select("id")
        .single();

    if (insertError) {
        console.error('Insert Error:', insertError);
        return;
    }

    console.log('Successfully inserted product ID:', newProduct.id);

    // Try price history
    const { error: historyError } = await supabase
        .from("price_history")
        .insert({
            product_id: newProduct.id,
            purchase_price: 250,
            selling_price: 260,
        });

    if (historyError) {
        console.error('Price History Error:', historyError);
    } else {
        console.log('Successfully recorded price history');
    }
}

testInsert();
