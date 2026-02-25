
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fidxjegjkpilfgkbkboi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function listProducts() {
    const { data, error } = await supabase
        .from('products')
        .select('*');

    if (error) {
        console.error('Error fetching products:', error);
    } else {
        console.log('Total products found:', data.length);
        if (data.length > 0) {
            console.log('Sample product fields:', Object.keys(data[0]));
            console.log('Sample product:', JSON.stringify(data[0], null, 2));
        } else {
            console.log('No products found in the table.');
        }
    }
}

listProducts();
