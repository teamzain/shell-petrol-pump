-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    ntn_number TEXT,
    product_type TEXT CHECK (product_type IN ('fuel', 'oil', 'both')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure all columns exist for suppliers (in case table was created previously without them)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ntn_number TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Company Accounts table
CREATE TABLE IF NOT EXISTS company_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE UNIQUE,
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Company Account Transactions table
CREATE TABLE IF NOT EXISTS company_account_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_account_id UUID REFERENCES company_accounts(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number TEXT,
    note TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure reference columns exist for transactions
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS note TEXT;

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('fuel', 'oil')),
    category TEXT, -- Engine Oil, Brake Oil, etc. for oils; "Fuel" for fuel
    unit TEXT NOT NULL DEFAULT 'Liters',
    current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock_level NUMERIC(12, 2) DEFAULT 10 CHECK (min_stock_level >= 0),
    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    tank_capacity NUMERIC(12, 2), -- Only for fuel
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Validations
    CONSTRAINT selling_price_gt_purchase CHECK (selling_price >= purchase_price),
    CONSTRAINT tank_capacity_validation CHECK (
        (type = 'fuel' AND tank_capacity IS NOT NULL AND tank_capacity >= current_stock) OR 
        (type = 'oil')
    )
);

-- Ensure tank_capacity exists for products
ALTER TABLE products ADD COLUMN IF NOT EXISTS tank_capacity NUMERIC(12, 2);

-- Price History table
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    old_price NUMERIC(12, 2),
    new_price NUMERIC(12, 2) NOT NULL,
    reason TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number TEXT NOT NULL UNIQUE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    product_type TEXT CHECK (product_type IN ('fuel', 'oil', 'other')),
    ordered_quantity NUMERIC(12, 2) NOT NULL CHECK (ordered_quantity > 0),
    delivered_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    rate_per_liter NUMERIC(12, 2) NOT NULL CHECK (rate_per_liter > 0),
    estimated_total NUMERIC(15, 2) NOT NULL,
    expected_delivery_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_delivered', 'fully_delivered', 'cancelled', 'overdue')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivered_quantity NUMERIC(12, 2) NOT NULL CHECK (delivered_quantity > 0),
    rate_per_liter NUMERIC(12, 2) NOT NULL CHECK (rate_per_liter > 0),
    total_amount NUMERIC(15, 2) NOT NULL,
    company_invoice_number TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(supplier_id, company_invoice_number)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('delivery_expected', 'delivery_overdue', 'low_balance')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT, -- e.g., 'purchase_order'
    reference_id UUID, -- reference to po id
    is_read BOOLEAN DEFAULT false,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    fired_at TIMESTAMP WITH TIME ZONE,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Stock Daily Register table
CREATE TABLE IF NOT EXISTS stock_daily_register (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_type TEXT NOT NULL CHECK (product_type IN ('fuel', 'oil', 'other')),
    register_date DATE NOT NULL,
    opening_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_deliveries NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
    closing_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(product_type, register_date)
);

-- RLS Policies
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_daily_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to purchase_orders" ON purchase_orders;
CREATE POLICY "Allow authenticated full access to purchase_orders" ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to deliveries" ON deliveries;
CREATE POLICY "Allow authenticated full access to deliveries" ON deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to notifications" ON notifications;
CREATE POLICY "Allow authenticated full access to notifications" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to stock_daily_register" ON stock_daily_register;
CREATE POLICY "Allow authenticated full access to stock_daily_register" ON stock_daily_register FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all actions
DROP POLICY IF EXISTS "Allow authenticated full access to suppliers" ON suppliers;
CREATE POLICY "Allow authenticated full access to suppliers" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to company_accounts" ON company_accounts;
CREATE POLICY "Allow authenticated full access to company_accounts" ON company_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to company_account_transactions" ON company_account_transactions;
CREATE POLICY "Allow authenticated full access to company_account_transactions" ON company_account_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to products" ON products;
CREATE POLICY "Allow authenticated full access to products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to price_history" ON price_history;
CREATE POLICY "Allow authenticated full access to price_history" ON price_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow public read access to products (if needed for some parts of the dashboard)
DROP POLICY IF EXISTS "Allow public read access to products" ON products;
CREATE POLICY "Allow public read access to products" ON products FOR SELECT TO anon USING (true);

-- Atomic Delivery Function
CREATE OR REPLACE FUNCTION process_delivery(
    p_po_id UUID,
    p_delivered_quantity NUMERIC,
    p_rate_per_liter NUMERIC,
    p_delivery_date DATE,
    p_invoice_number TEXT,
    p_vehicle_number TEXT,
    p_driver_name TEXT,
    p_notes TEXT,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_delivery_id UUID;
    v_supplier_id UUID;
    v_product_type TEXT;
    v_product_id UUID;
    v_total_amount NUMERIC;
    v_ordered_qty NUMERIC;
    v_account_id UUID;
BEGIN
    -- 1. Get PO details
    SELECT supplier_id, product_type, ordered_quantity 
    INTO v_supplier_id, v_product_type, v_ordered_qty
    FROM purchase_orders WHERE id = p_po_id;

    v_total_amount := p_delivered_quantity * p_rate_per_liter;

    -- 2. Insert Delivery Record
    INSERT INTO deliveries (
        purchase_order_id, supplier_id, delivery_date, delivered_quantity,
        rate_per_liter, total_amount, company_invoice_number, vehicle_number,
        driver_name, notes, created_by
    ) VALUES (
        p_po_id, v_supplier_id, p_delivery_date, p_delivered_quantity,
        p_rate_per_liter, v_total_amount, p_invoice_number, p_vehicle_number,
        p_driver_name, p_notes, p_user_id
    ) RETURNING id INTO v_delivery_id;

    -- 3. Update PO status and quantity
    UPDATE purchase_orders 
    SET 
        delivered_quantity = delivered_quantity + p_delivered_quantity,
        status = CASE 
            WHEN (delivered_quantity + p_delivered_quantity) >= ordered_quantity THEN 'fully_delivered'
            ELSE 'partially_delivered'
        END,
        updated_at = now()
    WHERE id = p_po_id;

    -- 4. Get Company Account and Debit
    SELECT id INTO v_account_id FROM company_accounts WHERE supplier_id = v_supplier_id;
    
    IF v_account_id IS NOT NULL THEN
        UPDATE company_accounts 
        SET current_balance = current_balance - v_total_amount,
            updated_at = now()
        WHERE id = v_account_id;

        INSERT INTO company_account_transactions (
            company_account_id, transaction_type, amount, transaction_date,
            reference_number, note, created_by
        ) VALUES (
            v_account_id, 'debit', v_total_amount, p_delivery_date,
            p_invoice_number, 'Delivery against PO# ' || (SELECT po_number FROM purchase_orders WHERE id = p_po_id),
            p_user_id
        );
    END IF;

    -- 5. Update Product Stock
    SELECT id INTO v_product_id FROM products WHERE name ILIKE '%' || v_product_type || '%' LIMIT 1;

    IF v_product_id IS NOT NULL THEN
        UPDATE products 
        SET current_stock = current_stock + p_delivered_quantity
        WHERE id = v_product_id;

        -- 6. Update Stock Daily Register
        INSERT INTO stock_daily_register (product_type, register_date, total_deliveries, closing_stock)
        VALUES (v_product_type, p_delivery_date, p_delivered_quantity, (SELECT current_stock FROM products WHERE id = v_product_id))
        ON CONFLICT (product_type, register_date) DO UPDATE SET
            total_deliveries = stock_daily_register.total_deliveries + EXCLUDED.total_deliveries,
            closing_stock = EXCLUDED.closing_stock;
    END IF;

    -- 7. Mark Notifications as read
    UPDATE notifications SET is_read = true, updated_at = now() 
    WHERE reference_id = p_po_id AND type IN ('delivery_expected', 'delivery_overdue');

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
