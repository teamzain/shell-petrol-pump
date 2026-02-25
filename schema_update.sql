-- ==========================================
-- Schema Updates for PO & Delivery Module
-- ==========================================

-- 1. Updates to Purchase Orders
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS quantity_remaining NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_type TEXT CHECK (unit_type IN ('liter', 'unit')),
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
ADD COLUMN IF NOT EXISTS delivered_amount NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hold_amount NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS hold_quantity NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false;

-- Update the status check on purchase_orders (Drop old constraint and add new constraint if possible, but for supabase, simple enum replacements can be complex. We'll leave the text column and just insert new strings).
-- Since status is TEXT with CHECK, we might need to recreate the CHECK constraint.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('pending', 'partially_delivered', 'fully_delivered', 'closed', 'cancelled', 'overdue'));

-- 2. Updates to Deliveries
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS delivery_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS product_category TEXT CHECK (product_category IN ('fuel', 'oil')),
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
ADD COLUMN IF NOT EXISTS quantity_ordered NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS quantity_remaining NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS unit_type TEXT CHECK (unit_type IN ('liter', 'unit')),
ADD COLUMN IF NOT EXISTS hold_amount NUMERIC(15, 2) DEFAULT 0;

-- 3. Updates to Company Account Transactions
ALTER TABLE company_account_transactions DROP CONSTRAINT IF EXISTS company_account_transactions_transaction_source_check;
ALTER TABLE company_account_transactions DROP CONSTRAINT IF EXISTS company_account_transactions_transaction_type_check;

ALTER TABLE company_account_transactions 
ADD COLUMN IF NOT EXISTS transaction_source TEXT CHECK (transaction_source IN ('opening_balance', 'manual_transfer', 'delivery', 'hold_release', 'reversal')),
ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES deliveries(id);
-- hold_record_id added later after creating po_hold_records

-- Allow negative/zero if needed, but original check was amount > 0.
-- Let's change transaction_type to just text and trust the app.
ALTER TABLE company_account_transactions ADD CONSTRAINT company_account_transactions_transaction_type_check CHECK (transaction_type IN ('credit', 'debit'));

-- 4. Create PO Hold Records Table
CREATE TABLE IF NOT EXISTS po_hold_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
    hold_quantity NUMERIC(12, 2) NOT NULL,
    hold_amount NUMERIC(15, 2) NOT NULL,
    expected_return_date DATE NULL,
    actual_return_date DATE,
    status TEXT NOT NULL DEFAULT 'on_hold' CHECK (status IN ('on_hold', 'released')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Now add hold_record_id to company account transactions
ALTER TABLE company_account_transactions 
ADD COLUMN IF NOT EXISTS hold_record_id UUID REFERENCES po_hold_records(id);

-- 5. Create PO Notifications Table
CREATE TABLE IF NOT EXISTS po_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('delivery_reminder', 'hold_return_reminder')),
    related_hold_id UUID REFERENCES po_hold_records(id),
    trigger_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'snoozed', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE po_hold_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to po_hold_records" ON po_hold_records;
CREATE POLICY "Allow authenticated full access to po_hold_records" ON po_hold_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to po_notifications" ON po_notifications;
CREATE POLICY "Allow authenticated full access to po_notifications" ON po_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Atomic Function for Recording Delivery
-- We replace the old process_delivery with a new atomic record_delivery_atomic handling full requirement

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
    v_hold_id UUID;
BEGIN
    -- 1. Get PO details and lock row to prevent concurrent deliveries
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF v_po.is_closed THEN
        RAISE EXCEPTION 'This PO is already closed. Only one delivery is allowed per order.';
    END IF;

    IF p_received_qty <= 0 THEN
        RAISE EXCEPTION 'Received quantity must be greater than 0.';
    END IF;

    -- Calculate amounts
    v_remaining_qty := v_po.ordered_quantity - p_received_qty;
    v_delivered_amount := p_received_qty * v_po.rate_per_liter;
    v_hold_amount := 0;

    IF v_remaining_qty > 0 THEN
        v_hold_amount := v_remaining_qty * v_po.rate_per_liter;
    END IF;

    -- 2. Insert Delivery Record
    INSERT INTO deliveries (
        delivery_number, purchase_order_id, supplier_id, delivery_date, 
        quantity_ordered, delivered_quantity, quantity_remaining,
        rate_per_liter, total_amount, delivered_amount, hold_amount,
        company_invoice_number, vehicle_number, driver_name, notes, created_by
    ) VALUES (
        p_delivery_number, p_po_id, v_po.supplier_id, p_delivery_date,
        v_po.ordered_quantity, p_received_qty, v_remaining_qty,
        v_po.rate_per_liter, v_po.estimated_total, v_delivered_amount, v_hold_amount,
        p_invoice_number, p_vehicle_number, p_driver_name, p_notes, p_user_id
    ) RETURNING id INTO v_delivery_id;

    -- 3. Update PO
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

    -- 4. Debit Company Account (only the delivered amount)
    SELECT id INTO v_account_id FROM company_accounts WHERE supplier_id = v_po.supplier_id;
    
    IF v_account_id IS NOT NULL THEN
        -- Allow negative balance as per requirements
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
            'Delivery - PO# ' || v_po.po_number || ' | ' || p_received_qty || ' ' || COALESCE(v_po.unit_type, 'units') || ' | Invoice# ' || COALESCE(p_invoice_number, 'N/A'),
            p_user_id
        );
    END IF;

    -- 5. Handle Hold (if applicable)
    IF v_hold_amount > 0 THEN
        INSERT INTO po_hold_records (
            purchase_order_id, delivery_id, hold_quantity, hold_amount, expected_return_date, created_by
        ) VALUES (
            p_po_id, v_delivery_id, v_remaining_qty, v_hold_amount, NULL, p_user_id
        ) RETURNING id INTO v_hold_id;
    END IF;

    -- Mark any pending delivery expected notifications as completed
    UPDATE notifications SET is_read = true WHERE reference_id = p_po_id AND type IN ('delivery_expected', 'delivery_overdue');

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Atomic Function for Releasing Hold
CREATE OR REPLACE FUNCTION release_po_hold(
    p_hold_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_hold RECORD;
    v_po RECORD;
    v_account_id UUID;
BEGIN
    -- Get hold info
    SELECT * INTO v_hold FROM po_hold_records WHERE id = p_hold_id FOR UPDATE;
    
    IF v_hold.status = 'released' THEN
        RAISE EXCEPTION 'Hold is already released.';
    END IF;

    -- Get PO info
    SELECT * INTO v_po FROM purchase_orders WHERE id = v_hold.purchase_order_id;
    
    -- Get account id
    SELECT id INTO v_account_id FROM company_accounts WHERE supplier_id = v_po.supplier_id;

    -- Update hold status
    UPDATE po_hold_records 
    SET status = 'released', actual_return_date = CURRENT_DATE, updated_at = now()
    WHERE id = p_hold_id;

    -- Credit company account
    IF v_account_id IS NOT NULL THEN
        UPDATE company_accounts 
        SET current_balance = current_balance + v_hold.hold_amount,
            updated_at = now()
        WHERE id = v_account_id;

        INSERT INTO company_account_transactions (
            company_account_id, transaction_type, transaction_source, amount, transaction_date,
            purchase_order_id, delivery_id, hold_record_id, note, created_by
        ) VALUES (
            v_account_id, 'credit', 'hold_release', v_hold.hold_amount, CURRENT_DATE,
            v_po.id, v_hold.delivery_id, p_hold_id, 
            'Hold Released - PO# ' || v_po.po_number || ' | ' || v_hold.hold_quantity || ' ' || COALESCE(v_po.unit_type, 'units') || ' not delivered, amount returned by supplier',
            p_user_id
        );
    END IF;

    -- Update notification status
    UPDATE po_notifications 
    SET status = 'completed', updated_at = now()
    WHERE related_hold_id = p_hold_id AND notification_type = 'hold_return_reminder';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
