-- ==========================================
-- Fix: Cap Delivery Amount for Extra Quantity
-- ==========================================

-- 1. Fix for record_delivery_atomic_item (Item-level deliveries)
CREATE OR REPLACE FUNCTION record_delivery_atomic_item(
    p_po_id UUID,
    p_item_index INT,
    p_delivery_number TEXT,
    p_received_qty NUMERIC,
    p_delivery_date DATE,
    p_invoice_number TEXT,
    p_vehicle_number TEXT,
    p_driver_name TEXT,
    p_notes TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_po RECORD;
    v_item JSONB;
    v_ordered_qty NUMERIC;
    v_rate_per_liter NUMERIC;
    v_product_id UUID;
    v_product_name TEXT;
    v_delivery_id UUID;
    v_delivered_amount NUMERIC;
    v_hold_amount NUMERIC;
    v_remaining_qty NUMERIC;
    v_account_id UUID;
    v_items_array JSONB;
    v_all_delivered BOOLEAN := true;
    i INT := 0;
BEGIN
    -- Handle empty strings explicitly to avoid unique constraint violations
    IF p_invoice_number = '' THEN p_invoice_number := NULL; END IF;
    IF p_vehicle_number = '' THEN p_vehicle_number := NULL; END IF;
    IF p_driver_name = '' THEN p_driver_name := NULL; END IF;

    -- 1. Get PO details and lock row to prevent concurrent deliveries
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF v_po.status = 'closed' OR v_po.status = 'cancelled' THEN
        RAISE EXCEPTION 'This PO is closed or cancelled. Deliveries cannot be recorded.';
    END IF;

    -- Extract Item
    v_item := v_po.items->p_item_index;
    
    IF v_item IS NULL THEN
        RAISE EXCEPTION 'Item not found in Purchase Order.';
    END IF;

    IF (v_item->>'status') = 'delivered' THEN
        RAISE EXCEPTION 'This specific item is already fully delivered.';
    END IF;

    v_ordered_qty := (v_item->>'ordered_quantity')::NUMERIC;
    v_rate_per_liter := (v_item->>'rate_per_liter')::NUMERIC;
    v_product_id := (v_item->>'product_id')::UUID;
    v_product_name := (v_item->>'product_name')::TEXT;

    IF p_received_qty <= 0 THEN
        RAISE EXCEPTION 'Received quantity must be greater than 0.';
    END IF;

    -- CRITICAL FIX: Calculate amounts with capping to ordered quantity
    v_delivered_amount := LEAST(p_received_qty, v_ordered_qty) * v_rate_per_liter;
    v_remaining_qty := v_ordered_qty - p_received_qty;
    v_hold_amount := 0;

    IF v_remaining_qty > 0 THEN
        v_hold_amount := v_remaining_qty * v_rate_per_liter;
    ELSE
        -- Over-delivery or exact delivery
        v_remaining_qty := 0;
        v_hold_amount := 0;
    END IF;

    -- 2. Insert Delivery Record
    INSERT INTO deliveries (
        delivery_number, purchase_order_id, supplier_id, delivery_date, 
        quantity_ordered, delivered_quantity, quantity_remaining,
        rate_per_liter, total_amount, delivered_amount, hold_amount,
        company_invoice_number, vehicle_number, driver_name, notes, created_by,
        product_id, product_name, po_item_index
    ) VALUES (
        p_delivery_number, p_po_id, v_po.supplier_id, p_delivery_date,
        v_ordered_qty, p_received_qty, v_remaining_qty,
        v_rate_per_liter, (v_ordered_qty * v_rate_per_liter), v_delivered_amount, v_hold_amount,
        p_invoice_number, p_vehicle_number, p_driver_name, p_notes, p_user_id,
        v_product_id, v_product_name, p_item_index
    ) RETURNING id INTO v_delivery_id;

    -- 3. Update PO JSONB items
    v_items_array := v_po.items;
    
    -- Update specific item in array
    v_items_array := jsonb_set(
        v_items_array,
        ARRAY[p_item_index::text],
        v_item || jsonb_build_object(
            'delivered_quantity', p_received_qty,
            'status', 'delivered'
        )
    );

    -- Check if all items are delivered
    WHILE i < jsonb_array_length(v_items_array) LOOP
        IF (v_items_array->i->>'status') != 'delivered' AND (v_items_array->i->>'status') != 'received' THEN
            v_all_delivered := false;
        END IF;
        i := i + 1;
    END LOOP;

    -- Update PO
    UPDATE purchase_orders 
    SET 
        items = v_items_array,
        status = CASE WHEN v_all_delivered THEN 'closed' ELSE 'partially_delivered' END,
        is_closed = v_all_delivered,
        updated_at = now()
    WHERE id = p_po_id;

    -- Update Stock
    IF v_product_id IS NOT NULL THEN
        UPDATE products 
        SET current_stock = current_stock + p_received_qty,
            updated_at = now()
        WHERE id = v_product_id;

        INSERT INTO stock_movements (
            product_id, movement_type, quantity, 
            reference_number, notes
        ) VALUES (
            v_product_id, 'purchase', p_received_qty,
            p_delivery_number, p_notes
        );
    END IF;

    -- Handle Hold (if applicable)
    IF v_hold_amount > 0 THEN
        INSERT INTO po_hold_records (
            purchase_order_id, delivery_id, hold_quantity, hold_amount, created_by,
            supplier_id, product_id, product_name, po_item_index
        ) VALUES (
            p_po_id, v_delivery_id, v_remaining_qty, v_hold_amount, p_user_id,
            v_po.supplier_id, v_product_id, v_product_name, p_item_index
        );
    END IF;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix for record_delivery_atomic (Legacy/Single-item deliveries)
CREATE OR REPLACE FUNCTION record_delivery_atomic(
    p_po_id UUID,
    p_delivery_number TEXT,
    p_received_qty NUMERIC,
    p_delivery_date DATE,
    p_invoice_number TEXT,
    p_vehicle_number TEXT,
    p_driver_name TEXT,
    p_notes TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_po RECORD;
    v_delivery_id UUID;
    v_delivered_amount NUMERIC;
    v_hold_amount NUMERIC;
    v_remaining_qty NUMERIC;
    v_account_id UUID;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF v_po.is_closed THEN
        RAISE EXCEPTION 'This PO is already closed.';
    END IF;

    -- CRITICAL FIX: LEAST protection
    v_remaining_qty := v_po.ordered_quantity - p_received_qty;
    v_delivered_amount := LEAST(p_received_qty, v_po.ordered_quantity) * v_po.rate_per_liter;
    v_hold_amount := 0;

    IF v_remaining_qty > 0 THEN
        v_hold_amount := v_remaining_qty * v_po.rate_per_liter;
    END IF;

    INSERT INTO deliveries (
        delivery_number, purchase_order_id, supplier_id, delivery_date, 
        quantity_ordered, delivered_quantity, quantity_remaining,
        rate_per_liter, total_amount, delivered_amount, hold_amount,
        company_invoice_number, vehicle_number, driver_name, notes, created_by
    ) VALUES (
        p_delivery_number, p_po_id, v_po.supplier_id, p_delivery_date,
        v_po.ordered_quantity, p_received_qty, CASE WHEN v_remaining_qty < 0 THEN 0 ELSE v_remaining_qty END,
        v_po.rate_per_liter, v_po.estimated_total, v_delivered_amount, v_hold_amount,
        p_invoice_number, p_vehicle_number, p_driver_name, p_notes, p_user_id
    ) RETURNING id INTO v_delivery_id;

    UPDATE purchase_orders 
    SET 
        delivered_quantity = p_received_qty,
        quantity_remaining = CASE WHEN v_remaining_qty < 0 THEN 0 ELSE v_remaining_qty END,
        delivered_amount = v_delivered_amount,
        hold_amount = v_hold_amount,
        hold_quantity = CASE WHEN v_remaining_qty < 0 THEN 0 ELSE v_remaining_qty END,
        is_closed = true,
        status = 'closed',
        updated_at = now()
    WHERE id = p_po_id;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
