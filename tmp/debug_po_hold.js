
const { createClient } = require('@supabase/supabase-js');

async function findHold() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Find PO-2026-0009
    const { data: po } = await supabase
        .from('purchase_orders')
        .select('id, po_number')
        .eq('po_number', 'PO-2026-0009')
        .single();
    
    if (!po) {
        console.log("PO-2026-0009 NOT FOUND");
        return;
    }
    
    // Find delivery for this PO
    const { data: delivery } = await supabase
        .from('deliveries')
        .select('id, delivery_date')
        .eq('po_id', po.id)
        .single();
        
    if (!delivery) {
        console.log("DELIVERY FOR PO-2026-0009 NOT FOUND");
        return;
    }
    
    console.log("DELIVERY:", delivery);
    
    // Find hold record for this delivery
    const { data: hold } = await supabase
        .from('po_hold_records')
        .select('*')
        .eq('delivery_id', delivery.id);
        
    console.log("HOLD RECORDS:", hold);
}

findHold();
