-- FIX: Add ALL missing payment columns to purchase_orders
ALTER TABLE purchase_orders 
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'upfront' 
    CHECK (payment_mode IN ('upfront', 'on_delivery', 'deferred')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid' 
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash' 
    CHECK (payment_method IN ('cash', 'bank')),
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- Backfill existing rows so data is consistent
UPDATE purchase_orders 
SET 
  payment_mode = 'upfront',
  payment_status = 'paid',
  paid_amount = COALESCE(estimated_total, 0),
  payment_method = 'cash'
WHERE payment_mode IS NULL;

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';
