-- =============================================
-- FINAL CARD HOLD RECORDS SCHEMA SYNC
-- =============================================

-- 1. Standardize Columns in card_hold_records
DO $$ 
BEGIN 
    -- Add card_type if missing (used as payment_type in some versions)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'card_type') THEN
        ALTER TABLE public.card_hold_records ADD COLUMN card_type TEXT;
        -- Migrate data if payment_type exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'payment_type') THEN
            UPDATE public.card_hold_records SET card_type = payment_type;
        END IF;
    END IF;

    -- Add missing tax and amount columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'tax_percentage') THEN
        ALTER TABLE public.card_hold_records ADD COLUMN tax_percentage NUMERIC(5, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'tax_amount') THEN
        ALTER TABLE public.card_hold_records ADD COLUMN tax_amount NUMERIC(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'net_amount') THEN
        ALTER TABLE public.card_hold_records ADD COLUMN net_amount NUMERIC(15, 2) DEFAULT 0;
        -- Simple migration: net = hold
        UPDATE public.card_hold_records SET net_amount = hold_amount WHERE net_amount = 0;
    END IF;

    -- Add released_at if missing (alias to actual_release_date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'released_at') THEN
        ALTER TABLE public.card_hold_records ADD COLUMN released_at TIMESTAMPTZ;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'actual_release_date') THEN
            UPDATE public.card_hold_records SET released_at = actual_release_date::TIMESTAMPTZ;
        END IF;
    END IF;

    -- Add bank_account_id (Target account for settlement)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_hold_records' AND column_name = 'bank_account_id') THEN
        ALTER TABLE public.card_hold_records ADD COLUMN bank_account_id UUID REFERENCES public.bank_accounts(id);
    END IF;

END $$;

-- 2. Ensure constraints and defaults
ALTER TABLE public.card_hold_records ALTER COLUMN card_type SET NOT NULL;
ALTER TABLE public.card_hold_records ALTER COLUMN hold_amount SET NOT NULL;
ALTER TABLE public.card_hold_records ALTER COLUMN net_amount SET NOT NULL;
ALTER TABLE public.card_hold_records ALTER COLUMN status SET DEFAULT 'pending';

-- Drop old columns if they were successfully migrated (Optional, keeping for safety for now)
-- ALTER TABLE public.card_hold_records DROP COLUMN IF EXISTS payment_type;
-- ALTER TABLE public.card_hold_records DROP COLUMN IF EXISTS actual_release_date;

-- 3. Update Sync Trigger to be Robust
CREATE OR REPLACE FUNCTION sync_card_hold_to_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_diff NUMERIC;
    v_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_diff := NEW.hold_amount;
        v_date := NEW.sale_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_diff := NEW.hold_amount - OLD.hold_amount;
        v_date := NEW.sale_date;
    ELSIF (TG_OP = 'DELETE') THEN
        v_diff := -OLD.hold_amount;
        v_date := OLD.sale_date;
    END IF;

    -- Update closing_cash (Net Cash) and total_card_hold
    -- Closing Cash goes DOWN when Card Hold goes UP
    INSERT INTO daily_accounts_status (status_date, closing_cash, total_card_hold)
    VALUES (v_date, -v_diff, v_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) - v_diff,
        total_card_hold = COALESCE(daily_accounts_status.total_card_hold, 0) + v_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger
DROP TRIGGER IF EXISTS trg_sync_card_hold ON card_hold_records;
CREATE TRIGGER trg_sync_card_hold
AFTER INSERT OR UPDATE OR DELETE ON card_hold_records
FOR EACH ROW EXECUTE FUNCTION sync_card_hold_to_balance();

-- Reload Cache
NOTIFY pgrst, 'reload schema';
