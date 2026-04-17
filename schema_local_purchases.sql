-- Migration to support Local Purchases with deferred payments

-- 1. Add columns to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_type TEXT DEFAULT 'company' CHECK (purchase_type IN ('company', 'local'));
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'prepaid' CHECK (payment_method IN ('prepaid', 'deferred'));
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially_paid', 'fully_paid'));

-- 2. Backfill existing orders
UPDATE purchase_orders SET purchase_type = 'company', payment_method = 'prepaid', payment_status = 'fully_paid', paid_amount = estimated_total WHERE purchase_type IS NULL;

-- 3. Add index for performance
CREATE INDEX IF NOT EXISTS idx_po_purchase_type ON purchase_orders(purchase_type);
CREATE INDEX IF NOT EXISTS idx_po_payment_status ON purchase_orders(payment_status);
