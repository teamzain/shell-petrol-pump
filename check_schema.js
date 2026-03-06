const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

async function checkSchema() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('Missing Supabase credentials');
        return;
    }

    const supabase = createClient(url, key);

    try {
        // Try to get one record to see keys
        const { data, error } = await supabase.from('card_hold_records').select('*').limit(1);

        if (error) {
            console.log('Error selecting from table:', error.message);
            // If column not found on select *, it's really missing or cache is broken
        } else {
            if (data.length > 0) {
                console.log('Columns in card_hold_records:', Object.keys(data[0]));
            } else {
                console.log('Table found but empty. Trying to trigger a schema error by selecting card_type explicitly...');
                const { error: error2 } = await supabase.from('card_hold_records').select('card_type').limit(1);
                if (error2) {
                    console.log('Confirmation error:', error2.message);
                } else {
                    console.log('card_type exists according to direct select');
                }
            }
        }
    } catch (err) {
        console.error('Script error:', err);
    }
}

checkSchema();
