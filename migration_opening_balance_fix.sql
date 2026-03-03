-- Migration to add missing columns for opening balance restriction and tracking

-- 1. Add opening_balances_set to daily_accounts_status
ALTER TABLE daily_accounts_status 
ADD COLUMN IF NOT EXISTS opening_balances_set BOOLEAN DEFAULT FALSE;

-- 2. Add is_opening to balance_transactions
ALTER TABLE balance_transactions 
ADD COLUMN IF NOT EXISTS is_opening BOOLEAN DEFAULT FALSE;

-- 3. Enable realtime for critical balance tables
-- This allows the dashboard to update automatically across all devices
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'daily_accounts_status') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE daily_accounts_status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'balance_transactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE balance_transactions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bank_accounts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE bank_accounts;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If publication doesn't exist or other error, just ignore
    RAISE NOTICE 'Could not enable realtime publication automatically. Please enable it in Supabase Dashboard.';
END $$;

-- 4. Notify PostgREST to reload schema cache
-- NOTE: If the error persists, please go to Supabase Dashboard -> API Settings -> Schema Cache -> "Reload Schema"
