-- Add is_hold and card_hold_id to balance_transactions
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS is_hold BOOLEAN DEFAULT false;
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS card_hold_id UUID REFERENCES card_hold_records(id) ON DELETE SET NULL;

-- Also add balance_before and balance_after if they don't exist (just in case)
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS balance_before NUMERIC(15, 2);
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(15, 2);

-- Update existing records to have is_hold = false
UPDATE balance_transactions SET is_hold = false WHERE is_hold IS NULL;
