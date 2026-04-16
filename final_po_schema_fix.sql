-- FINAL FIX: Add all missing columns for PO integration
ALTER TABLE balance_transactions 
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id);

ALTER TABLE company_account_transactions
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id);

-- Refresh the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
