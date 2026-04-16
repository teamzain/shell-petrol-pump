-- Fix: Enforce Due State for all Local Supplier Debits
-- Run this in the Supabase SQL Editor

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
