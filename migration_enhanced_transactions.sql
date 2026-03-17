-- Migration: Add Enhanced Transaction Details
-- Adds tracking for source and destination bank accounts

-- 1. Update balance_transactions
ALTER TABLE balance_transactions
ADD COLUMN IF NOT EXISTS to_bank_account_id UUID REFERENCES bank_accounts(id);

-- Update check constraint for transaction_type in balance_transactions
-- We need to drop the old one and add much more comprehensive options
ALTER TABLE balance_transactions DROP CONSTRAINT IF EXISTS balance_transactions_transaction_type_check;
ALTER TABLE balance_transactions ADD CONSTRAINT balance_transactions_transaction_type_check 
CHECK (transaction_type IN ('cash_to_bank', 'bank_to_cash', 'add_cash', 'add_bank', 'transfer_to_supplier', 'supplier_to_bank', 'bank_to_bank'));

-- 2. Update company_account_transactions
ALTER TABLE company_account_transactions
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- 3. Add balance_before and balance_after to company_account_transactions if not already there (for consistency with balance_transactions)
-- (Checking suppliers.ts showed these are already used, but let's ensure they exist in schema)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_account_transactions' AND column_name='balance_before') THEN
        ALTER TABLE company_account_transactions ADD COLUMN balance_before NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_account_transactions' AND column_name='balance_after') THEN
        ALTER TABLE company_account_transactions ADD COLUMN balance_after NUMERIC(15, 2) DEFAULT 0;
    END IF;
END $$;
