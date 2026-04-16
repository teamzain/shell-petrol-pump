-- =====================================================
-- FIX: Add missing columns & update check constraints
-- Run this in: Supabase → SQL Editor
-- =====================================================

-- 1. Fix purchase_orders table
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS quantity_remaining NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'liter' CHECK (unit_type IN ('liter', 'unit')),
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

-- 2. Fix company_account_transactions table
ALTER TABLE company_account_transactions
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

-- 3. Relax/Update transaction_source check constraint
-- Drop if exists and recreate with all valid sources
ALTER TABLE company_account_transactions 
  DROP CONSTRAINT IF EXISTS company_account_transactions_transaction_source_check;

ALTER TABLE company_account_transactions
  ADD CONSTRAINT company_account_transactions_transaction_source_check 
  CHECK (transaction_source IN (
    'opening_balance', 
    'purchase_order', 
    'manual_transfer', 
    'purchase_order_cancellation', 
    'manual_adjustment',
    'delivery_adjustment'
  ));

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
