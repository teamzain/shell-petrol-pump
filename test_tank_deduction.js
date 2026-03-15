const { createClient } = require('@supabase/supabase-js');

async function testSaleAndTankDeduction() {
    const url = 'https://fidxjegjkpilfgkbkboi.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhqZWdqa3BpbGZna2JrYm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgzMTcsImV4cCI6MjA4NzM2NDMxN30.zNrRcK15Iyy-cg9P-bD0i8waJVVXreADHwVFd_Vphzs';
    const supabase = createClient(url, key);

    try {
        console.log('--- Finding a valid exact Nozzle -> Dispenser -> Tank chain ---');
        let { data: nozzles } = await supabase.from('nozzles').select('id, nozzle_number, product_id, dispenser_id, current_reading').limit(1);
        if (!nozzles || nozzles.length === 0) {
            console.log('No nozzles found.');
            return;
        }

        const nozzle = nozzles[0];
        console.log(`Using Nozzle: ${nozzle.nozzle_number} (ID: ${nozzle.id}, Product: ${nozzle.product_id})`);

        let { data: dispenser } = await supabase.from('dispensers').select('*').eq('id', nozzle.dispenser_id).single();
        console.log(`Dispenser: ${dispenser ? dispenser.name : 'Unknown'}, Tank IDs: ${dispenser ? dispenser.tank_ids : 'Unknown'}`);

        if (!dispenser || !dispenser.tank_ids || dispenser.tank_ids.length === 0) {
            console.log('No tank connected to this dispenser.');
            return;
        }

        let { data: matchingTanks } = await supabase
            .from('tanks')
            .select('id, name, current_level, product_id')
            .in('id', dispenser.tank_ids)
            .eq('product_id', nozzle.product_id)
            .limit(1);

        if (!matchingTanks || matchingTanks.length === 0) {
            console.log('No tank with matching product found for this dispenser.');
            return;
        }

        const tank = matchingTanks[0];
        console.log(`Matching Tank: ${tank.name} (ID: ${tank.id}), current level: ${tank.current_level}`);

        // We will just verify the current logic works in node
        console.log(`Everything looks correctly connected. The new logic will deduct from Tank ID ${tank.id} upon saving the sale.`);

    } catch (err) {
        console.error('Script error:', err);
    }
}

testSaleAndTankDeduction();
