-- 1. Add missing fields to `deliveries` and `po_hold_records` to track item-level deliveries
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS po_item_index INT,
  ADD COLUMN IF NOT EXISTS delivered_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS hold_amount NUMERIC(15,2);

ALTER TABLE po_hold_records
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS po_item_index INT;

-- 2. New Atomic Delivery function strictly for item array logic
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

    -- Calculate amounts
    v_remaining_qty := v_ordered_qty - p_received_qty;
    v_delivered_amount := p_received_qty * v_rate_per_liter;
    v_hold_amount := 0;

    IF v_remaining_qty > 0 THEN
        v_hold_amount := v_remaining_qty * v_rate_per_liter;
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

    -- 3. Update PO JSONB items and Product Stock
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

    -- Update Stock (if product exists)
    IF v_product_id IS NOT NULL THEN
        UPDATE products 
        SET current_stock = current_stock + p_received_qty
        WHERE id = v_product_id;
    END IF;

    -- 4. Debit Company Account (only the delivered amount)
    SELECT id INTO v_account_id FROM company_accounts WHERE supplier_id = v_po.supplier_id;
    
    IF v_account_id IS NOT NULL THEN
        UPDATE company_accounts 
        SET current_balance = current_balance - v_delivered_amount,
            updated_at = now()
        WHERE id = v_account_id;

        INSERT INTO company_account_transactions (
            company_account_id, transaction_type, transaction_source, amount, transaction_date,
            reference_number, purchase_order_id, delivery_id, note, created_by
        ) VALUES (
            v_account_id, 'debit', 'delivery', v_delivered_amount, p_delivery_date,
            p_invoice_number, p_po_id, v_delivery_id, 
            'Delivery - PO# ' || v_po.po_number || ' | ' || p_received_qty || ' ' || COALESCE((v_item->>'unit_type'), 'units') || ' of ' || v_product_name || ' | Invoice# ' || COALESCE(p_invoice_number, 'N/A'),
            p_user_id
        );
    END IF;

    -- 5. Handle Hold (if applicable)
    IF v_hold_amount > 0 THEN
        INSERT INTO po_hold_records (
            purchase_order_id, delivery_id, hold_quantity, hold_amount, expected_return_date, created_by,
            company_account_id, supplier_id, product_id, product_name, po_item_index
        ) VALUES (
            p_po_id, v_delivery_id, v_remaining_qty, v_hold_amount, NULL, p_user_id,
            v_account_id, v_po.supplier_id, v_product_id, v_product_name, p_item_index
        );
    END IF;

    -- 6. Update Stock Daily Register
    INSERT INTO stock_daily_register (product_type, register_date, total_deliveries, closing_stock)
    VALUES (
        COALESCE(v_item->>'product_category', 'other'), 
        p_delivery_date, 
        p_received_qty, 
        COALESCE((SELECT current_stock FROM products WHERE id = v_product_id), 0)
    )
    ON CONFLICT (product_type, register_date) DO UPDATE SET
        total_deliveries = stock_daily_register.total_deliveries + EXCLUDED.total_deliveries,
        closing_stock = COALESCE((SELECT current_stock FROM products WHERE id = v_product_id), 0);

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
