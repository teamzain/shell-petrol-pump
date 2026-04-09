-- ============================================================
-- Supplier Credit Balance System Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add credit_limit column to company_accounts
--    NULL means no credit facility (normal positive-balance account)
--    A value like 7500000 means the balance can go as low as -7500000
ALTER TABLE company_accounts
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15, 2) DEFAULT NULL;

-- 2. Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'company_accounts'
  AND column_name = 'credit_limit';
