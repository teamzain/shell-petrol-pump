-- Migration: Add account_type to bank_accounts
ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'bank' CHECK (account_type IN ('bank', 'supplier'));

-- Optional: If there are existing accounts that should be 'supplier', they can be updated here.
-- For now, we default all to 'bank'.

COMMENT ON COLUMN bank_accounts.account_type IS 'Distinguishes between regular bank accounts and supplier accounts.';
