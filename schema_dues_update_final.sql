-- =====================================================
-- STEP 1: Add Missing Columns to the Database Schema
-- =====================================================

ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS is_due BOOLEAN DEFAULT false;

-- =====================================================
-- STEP 2: Enforce Due State for all Local Supplier Debits
-- =====================================================

UPDATE company_account_transactions cat
SET 
    remaining_amount = cat.amount, 
    is_due = true
FROM company_accounts ca
JOIN suppliers s ON ca.supplier_id = s.id
WHERE cat.company_account_id = ca.id
  AND cat.transaction_type = 'debit'
  AND s.supplier_type = 'local'
  AND (cat.remaining_amount = 0 OR cat.remaining_amount IS NULL);
