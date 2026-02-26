-- Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'purchase', 'sale', 'adjustment')),
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL, -- Positive for additions, negative for subtractions
    previous_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
    balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit_price NUMERIC(12, 2),
    weighted_avg_after NUMERIC(12, 2),
    notes TEXT,
    reference_number TEXT, -- e.g. PO number, Invoice number, or Delivery number
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    ordered_quantity NUMERIC(12, 2), -- Track original order qty for purchases
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure products has weighted_avg_cost if missing (adding it safely)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weighted_avg_cost') THEN
        ALTER TABLE products ADD COLUMN weighted_avg_cost NUMERIC(12, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'stock_value') THEN
        ALTER TABLE products ADD COLUMN stock_value NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'updated_at') THEN
        ALTER TABLE products ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    END IF;
END $$;

-- Ensure stock_movements has ordered_quantity if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'ordered_quantity') THEN
        ALTER TABLE stock_movements ADD COLUMN ordered_quantity NUMERIC(12, 2);
    END IF;
END $$;

-- RLS Policies
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to stock_movements" ON stock_movements;
CREATE POLICY "Allow authenticated full access to stock_movements" ON stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Optional: Populate initial movements for existing stock (only if no movements exist for that product)
INSERT INTO stock_movements (product_id, movement_type, quantity, ordered_quantity, balance_after, previous_stock, notes)
SELECT id, 'initial', current_stock, current_stock, current_stock, 0, 'Seed initial stock'
FROM products p
WHERE current_stock > 0
AND NOT EXISTS (
    SELECT 1 FROM stock_movements m 
    WHERE m.product_id = p.id 
    AND m.movement_type = 'initial'
);

-- Backfill missing ordered_quantity for existing historical records
-- 1. For Initial stock, ordered = quantity
UPDATE stock_movements 
SET ordered_quantity = quantity 
WHERE ordered_quantity IS NULL 
AND movement_type = 'initial';

-- 2. For Purchases, try to get from deliveries table
UPDATE stock_movements m
SET ordered_quantity = d.quantity_ordered
FROM deliveries d
WHERE m.movement_type = 'purchase'
AND m.ordered_quantity IS NULL
AND m.reference_number = d.delivery_number
AND m.product_id = d.product_id;

-- 3. Final fallback: if still null, use quantity
UPDATE stock_movements 
SET ordered_quantity = quantity 
WHERE ordered_quantity IS NULL 
AND movement_type = 'purchase';
