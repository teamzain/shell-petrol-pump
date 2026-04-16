-- FIX: Add reference_number column to balance_transactions
ALTER TABLE balance_transactions 
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- Refresh the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
