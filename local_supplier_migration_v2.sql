-- 1. Extend schema for payment tracking
ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'upfront' CHECK (payment_mode IN ('upfront', 'deferred')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;

-- 2. Ensure existing data is consistent
UPDATE purchase_orders SET payment_status = 'paid', paid_amount = estimated_total WHERE payment_mode = 'upfront';

-- 3. UPDATED Atomic Delivery Function (Supports Deferred Debt Tracking)
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
    p_user_id UUID,
    p_tank_distribution JSONB DEFAULT '[]'::jsonb
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
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    v_items_array JSONB;
    v_all_delivered BOOLEAN := true;
    i INT := 0;
BEGIN
    -- Handle empty strings explicitly
    IF p_invoice_number = '' THEN p_invoice_number := NULL; END IF;
    IF p_vehicle_number = '' THEN p_vehicle_number := NULL; END IF;
    IF p_driver_name = '' THEN p_driver_name := NULL; END IF;

    -- 1. Get PO details and lock row
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
    v_delivered_amount := LEAST(p_received_qty, v_ordered_qty) * v_rate_per_liter;
    v_remaining_qty := v_ordered_qty - p_received_qty;
    v_hold_amount := 0;

    IF v_remaining_qty > 0 THEN
        v_hold_amount := v_remaining_qty * v_rate_per_liter;
    ELSE
        v_remaining_qty := 0;
        v_hold_amount := 0;
    END IF;

    -- 2. Insert Delivery Record (Fixed column names: po_item_index)
    INSERT INTO deliveries (
        delivery_number, purchase_order_id, supplier_id, delivery_date, 
        quantity_ordered, delivered_quantity, quantity_remaining,
        rate_per_liter, total_amount, delivered_amount, hold_amount,
        company_invoice_number, vehicle_number, driver_name, notes, created_by,
        product_id, product_name, po_item_index, tank_distribution
    ) VALUES (
        p_delivery_number, p_po_id, v_po.supplier_id, p_delivery_date,
        v_ordered_qty, p_received_qty, v_remaining_qty,
        v_rate_per_liter, (v_ordered_qty * v_rate_per_liter), v_delivered_amount, v_hold_amount,
        p_invoice_number, p_vehicle_number, p_driver_name, p_notes, p_user_id,
        v_product_id, v_product_name, p_item_index, p_tank_distribution
    ) RETURNING id INTO v_delivery_id;

    -- 3. Update PO JSONB items
    v_items_array := v_po.items;
    
    v_items_array := jsonb_set(
        v_items_array,
        ARRAY[p_item_index::text],
        v_item || jsonb_build_object(
            'delivered_quantity', COALESCE((v_item->>'delivered_quantity')::NUMERIC, 0) + p_received_qty,
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

    -- Update PO Status
    UPDATE purchase_orders 
    SET 
        items = v_items_array,
        status = CASE WHEN v_all_delivered THEN 'closed' ELSE 'partially_delivered' END,
        is_closed = v_all_delivered,
        updated_at = now()
    WHERE id = p_po_id;

    -- 4. Update Stock & WAC (if product exists)
    IF v_product_id IS NOT NULL THEN
        DECLARE
            v_prev_stock NUMERIC;
            v_prev_wac NUMERIC;
            v_new_stock NUMERIC;
            v_new_wac NUMERIC;
        BEGIN
            SELECT current_stock, COALESCE(weighted_avg_cost, 0) 
            INTO v_prev_stock, v_prev_wac 
            FROM products WHERE id = v_product_id;

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
                p_notes, p_delivery_number, v_po.supplier_id
            );
        END;
    END IF;

    -- 5. NEW: Handle Financial Impact for Deferred (Local) orders
    -- If the order is 'deferred', record the debt only now upon delivery.
    IF v_po.payment_mode = 'deferred' THEN
        SELECT id, current_balance INTO v_account_id, v_prev_balance 
        FROM company_accounts WHERE supplier_id = v_po.supplier_id FOR UPDATE;

        IF v_account_id IS NOT NULL THEN
            v_new_balance := v_prev_balance - v_delivered_amount;

            UPDATE company_accounts 
            SET current_balance = v_new_balance, updated_at = NOW() 
            WHERE id = v_account_id;

            INSERT INTO company_account_transactions (
                company_account_id, transaction_type, transaction_source, amount,
                balance_before, balance_after, transaction_date, reference_number,
                purchase_order_id, delivery_id, note, created_by
            ) VALUES (
                v_account_id, 'debit', 'purchase_order', v_delivered_amount,
                v_prev_balance, v_new_balance, p_delivery_date, v_po.po_number,
                p_po_id, v_delivery_id, 'Debt recorded upon delivery (Deferred PO)', p_user_id
            );
        END IF;
    END IF;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
