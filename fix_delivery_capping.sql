-- 0. Add missing columns to company_account_transactions
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS is_hold BOOLEAN DEFAULT false;
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS transaction_source TEXT;
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id);
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES deliveries(id);
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS balance_before NUMERIC(15, 2);
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(15, 2);

-- 1. Fixed Atomic Delivery function for item array logic
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
    v_unit_type TEXT;
    v_delivery_id UUID;
    v_delivered_amount NUMERIC;
    v_hold_amount NUMERIC;
    v_remaining_qty NUMERIC;
    v_items_array JSONB;
    v_all_delivered BOOLEAN := true;
    i INT := 0;
    -- Stock tracking
    v_prev_stock NUMERIC;
    v_prev_wac NUMERIC;
    v_new_stock NUMERIC;
    v_new_wac NUMERIC;
    -- Balance tracking
    v_account_id UUID;
    v_prev_balance NUMERIC;
BEGIN
    -- Handle empty strings explicitly to avoid unique constraint violations
    IF p_invoice_number = '' THEN p_invoice_number := NULL; END IF;
    IF p_vehicle_number = '' THEN p_vehicle_number := NULL; END IF;
    IF p_driver_name = '' THEN p_driver_name := NULL; END IF;

    -- Lock PO row
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
    v_unit_type := (v_item->>'unit_type')::TEXT;

    IF p_received_qty <= 0 THEN
        RAISE EXCEPTION 'Received quantity must be greater than 0.';
    END IF;

    -- Calculate amounts with capping
    v_delivered_amount := LEAST(p_received_qty, v_ordered_qty) * v_rate_per_liter;
    v_remaining_qty := v_ordered_qty - p_received_qty;
    v_hold_amount := GREATEST(0, v_remaining_qty * v_rate_per_liter);

    -- 2. Insert Delivery Record (Including unit_type)
    INSERT INTO deliveries (
        delivery_number, purchase_order_id, supplier_id, delivery_date, 
        quantity_ordered, delivered_quantity, quantity_remaining,
        rate_per_liter, total_amount, delivered_amount, hold_amount,
        company_invoice_number, vehicle_number, driver_name, notes, created_by,
        product_id, product_name, po_item_index, unit_type
    ) VALUES (
        p_delivery_number, p_po_id, v_po.supplier_id, p_delivery_date,
        v_ordered_qty, p_received_qty, GREATEST(0, v_remaining_qty),
        v_rate_per_liter, (v_ordered_qty * v_rate_per_liter), v_delivered_amount, v_hold_amount,
        p_invoice_number, p_vehicle_number, p_driver_name, p_notes, p_user_id,
        v_product_id, v_product_name, p_item_index, v_unit_type
    ) RETURNING id INTO v_delivery_id;

    -- 3. Update PO JSONB items
    v_items_array := v_po.items;
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

    -- Update PO status
    UPDATE purchase_orders 
    SET 
        items = v_items_array,
        status = CASE WHEN v_all_delivered THEN 'closed' ELSE 'partially_delivered' END,
        is_closed = v_all_delivered,
        updated_at = now()
    WHERE id = p_po_id;

    -- 4. Update Stock and Movement
    IF v_product_id IS NOT NULL THEN
        SELECT current_stock, COALESCE(weighted_avg_cost, 0) 
        INTO v_prev_stock, v_prev_wac 
        FROM products WHERE id = v_product_id FOR UPDATE;

        v_new_stock := v_prev_stock + p_received_qty;
        
        IF v_new_stock > 0 THEN
            v_new_wac := ((v_prev_stock * v_prev_wac) + (p_received_qty * v_rate_per_liter)) / v_new_stock;
        ELSE
            v_new_wac := v_rate_per_liter;
        END IF;

        UPDATE products 
        SET current_stock = v_new_stock,
            weighted_avg_cost = v_new_wac,
            stock_value = v_new_stock * v_new_wac,
            updated_at = now()
        WHERE id = v_product_id;

        INSERT INTO stock_movements (
            product_id, movement_type, quantity, 
            ordered_quantity, previous_stock, 
            balance_after, unit_price, weighted_avg_after, 
            notes, reference_number, supplier_id
        ) VALUES (
            v_product_id, 'purchase', p_received_qty,
            v_ordered_qty, v_prev_stock,
            v_new_stock, v_rate_per_liter, v_new_wac,
            COALESCE(p_notes, 'Delivery against PO'), p_delivery_number, v_po.supplier_id
        );

        INSERT INTO stock_daily_register (product_type, register_date, total_deliveries, closing_stock)
        VALUES (
            COALESCE(v_item->>'product_category', 'other'), 
            p_delivery_date, 
            p_received_qty, 
            v_new_stock
        )
        ON CONFLICT (product_type, register_date) DO UPDATE SET
            total_deliveries = stock_daily_register.total_deliveries + EXCLUDED.total_deliveries,
            closing_stock = EXCLUDED.closing_stock;
    END IF;

    -- 5. Update Balance and Record Ledger Transaction (REMOVED: Deduction happens at PO creation)
    /*
    SELECT id, current_balance INTO v_account_id, v_prev_balance 
    FROM company_accounts WHERE supplier_id = v_po.supplier_id FOR UPDATE;

    IF v_account_id IS NOT NULL THEN
        UPDATE company_accounts 
        SET current_balance = current_balance - v_delivered_amount,
            updated_at = now()
        WHERE id = v_account_id;

        INSERT INTO company_account_transactions (
            company_account_id, transaction_type, transaction_source, amount, 
            transaction_date, reference_number, purchase_order_id, delivery_id, 
            note, created_by
        ) VALUES (
            v_account_id, 'debit', 'delivery', v_delivered_amount, p_delivery_date,
            p_invoice_number, p_po_id, v_delivery_id, 
            'Delivery - PO# ' || v_po.po_number || ' | ' || p_received_qty || ' ' || COALESCE(v_product_name, 'items'),
            p_user_id
        );
    END IF;
    */

    -- 6. Handle Hold Record (if applicable)
    IF v_hold_amount > 0 THEN
        INSERT INTO po_hold_records (
            purchase_order_id, delivery_id, hold_quantity, hold_amount, created_by,
            supplier_id, product_id, product_name, po_item_index, company_account_id
        ) VALUES (
            p_po_id, v_delivery_id, GREATEST(0, v_remaining_qty), v_hold_amount, p_user_id,
            v_po.supplier_id, v_product_id, v_product_name, p_item_index, v_account_id
        );
    END IF;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fixed legacy record_delivery_atomic (Single-item deliveries)
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
    -- Stock
    v_prev_stock NUMERIC;
    v_prev_wac NUMERIC;
    v_new_stock NUMERIC;
    v_new_wac NUMERIC;
    -- Balance
    v_account_id UUID;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF v_po.is_closed THEN
        RAISE EXCEPTION 'This PO is already closed.';
    END IF;

    v_remaining_qty := v_po.ordered_quantity - p_received_qty;
    v_delivered_amount := LEAST(p_received_qty, v_po.ordered_quantity) * v_po.rate_per_liter;
    v_hold_amount := GREATEST(0, v_remaining_qty * v_po.rate_per_liter);

    INSERT INTO deliveries (
        delivery_number, purchase_order_id, supplier_id, delivery_date, 
        quantity_ordered, delivered_quantity, quantity_remaining,
        rate_per_liter, total_amount, delivered_amount, hold_amount,
        company_invoice_number, vehicle_number, driver_name, notes, created_by,
        product_id, unit_type
    ) VALUES (
        p_delivery_number, p_po_id, v_po.supplier_id, p_delivery_date,
        v_po.ordered_quantity, p_received_qty, GREATEST(0, v_remaining_qty),
        v_po.rate_per_liter, v_po.estimated_total, v_delivered_amount, v_hold_amount,
        p_invoice_number, p_vehicle_number, p_driver_name, p_notes, p_user_id,
        v_po.product_id, v_po.unit_type
    ) RETURNING id INTO v_delivery_id;

    UPDATE purchase_orders 
    SET 
        delivered_quantity = p_received_qty,
        quantity_remaining = GREATEST(0, v_remaining_qty),
        delivered_amount = v_delivered_amount,
        hold_amount = v_hold_amount,
        hold_quantity = GREATEST(0, v_remaining_qty),
        is_closed = true,
        status = 'closed',
        updated_at = now()
    WHERE id = p_po_id;

    -- Update Stock
    IF v_po.product_id IS NOT NULL THEN
        SELECT current_stock, COALESCE(weighted_avg_cost, 0) 
        INTO v_prev_stock, v_prev_wac 
        FROM products WHERE id = v_po.product_id FOR UPDATE;

        v_new_stock := v_prev_stock + p_received_qty;
        
        IF v_new_stock > 0 THEN
            v_new_wac := ((v_prev_stock * v_prev_wac) + (p_received_qty * v_po.rate_per_liter)) / v_new_stock;
        ELSE
            v_new_wac := v_po.rate_per_liter;
        END IF;

        UPDATE products 
        SET current_stock = v_new_stock,
            weighted_avg_cost = v_new_wac,
            stock_value = v_new_stock * v_new_wac,
            updated_at = now()
        WHERE id = v_po.product_id;

        INSERT INTO stock_movements (
            product_id, movement_type, quantity, 
            ordered_quantity, previous_stock, 
            balance_after, unit_price, weighted_avg_after, 
            notes, reference_number, supplier_id
        ) VALUES (
            v_po.product_id, 'purchase', p_received_qty,
            v_po.ordered_quantity, v_prev_stock,
            v_new_stock, v_po.rate_per_liter, v_new_wac,
            COALESCE(p_notes, 'Legacy Delivery'), p_delivery_number, v_po.supplier_id
        );
    END IF;

    -- Update Balance and Record Transaction (REMOVED: Deduction happens at PO creation)
    /*
    SELECT id INTO v_account_id FROM company_accounts WHERE supplier_id = v_po.supplier_id FOR UPDATE;

    IF v_account_id IS NOT NULL THEN
        UPDATE company_accounts 
        SET current_balance = current_balance - v_delivered_amount,
            updated_at = now()
        WHERE id = v_account_id;

        INSERT INTO company_account_transactions (
            company_account_id, transaction_type, transaction_source, amount, 
            transaction_date, reference_number, purchase_order_id, delivery_id, 
            note, created_by
        ) VALUES (
            v_account_id, 'debit', 'delivery', v_delivered_amount, p_delivery_date,
            p_invoice_number, p_po_id, v_delivery_id, 
            'Delivery - Legacy PO# ' || v_po.po_number,
            p_user_id
        );
    END IF;
    */

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill unit_type for existing deliveries
UPDATE deliveries d
SET unit_type = (po.items->d.po_item_index)->>'unit_type'
FROM purchase_orders po
WHERE d.purchase_order_id = po.id
AND d.po_item_index IS NOT NULL
AND d.unit_type IS NULL;

UPDATE deliveries d
SET unit_type = po.unit_type
FROM purchase_orders po
WHERE d.purchase_order_id = po.id
AND d.po_item_index IS NULL
AND d.unit_type IS NULL;

-- 4. Cleanup Double Deductions
-- Step A: Refund the balance for every 'delivery' transaction found (since PO creation already deducted it)
UPDATE company_accounts ca
SET current_balance = ca.current_balance + sub.total_to_refund,
    updated_at = now()
FROM (
    SELECT company_account_id, SUM(amount) as total_to_refund
    FROM company_account_transactions
    WHERE transaction_source = 'delivery'
    GROUP BY company_account_id
) sub
WHERE ca.id = sub.company_account_id;

-- Step B: Delete the redundant 'delivery' transactions
DELETE FROM company_account_transactions
WHERE transaction_source = 'delivery';
