-- Migration to add balance tracking to balance_transactions
ALTER TABLE balance_transactions
ADD COLUMN IF NOT EXISTS balance_before NUMERIC(15, 2),
ADD COLUMN IF NOT EXISTS balance_after NUMERIC(15, 2);

-- Update transaction_type constraint to be more descriptive if needed
-- (Current constraint: cash_to_bank, bank_to_cash, add_cash, add_bank, transfer_to_supplier)
