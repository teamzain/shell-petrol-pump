-- Fix 1: Make deliveries optional fields nullable
ALTER TABLE deliveries 
  ALTER COLUMN company_invoice_number DROP NOT NULL,
  ALTER COLUMN vehicle_number DROP NOT NULL,
  ALTER COLUMN driver_name DROP NOT NULL;

-- Fix 2: Add missing columns to purchase_orders if not exist
ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
  -- items stores multiple products per PO

-- Fix 3: Add supplier_id and company_account_id to po_hold_records
ALTER TABLE po_hold_records
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS company_account_id uuid 
    REFERENCES company_accounts(id),
  ADD COLUMN IF NOT EXISTS expected_return_date date NULL;

-- Fix 4: Make expected_return_date nullable in po_hold_records
ALTER TABLE po_hold_records
  ALTER COLUMN expected_return_date DROP NOT NULL;
