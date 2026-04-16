-- =====================================================
-- Add Transaction Due Tracking
-- RUN THIS IN: Supabase → SQL Editor
-- =====================================================

-- 1. Add tracking columns
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE company_account_transactions ADD COLUMN IF NOT EXISTS is_due BOOLEAN DEFAULT false;

-- 2. Initialize existing Local Supplier debits as 'Dues'
-- This ensures they show the 'Pay Due' button correctly.
UPDATE company_account_transactions 
SET 
  remaining_amount = amount, 
  is_due = true
FROM company_accounts, suppliers
WHERE company_account_transactions.company_account_id = company_accounts.id
  AND company_accounts.supplier_id = suppliers.id
  AND company_account_transactions.transaction_type = 'debit'
  AND suppliers.supplier_type = 'local'
  AND company_account_transactions.remaining_amount = 0;
