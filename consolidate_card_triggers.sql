-- =============================================
-- CONSOLIDATED CARD SYNC TRIGGER (FINAL v3)
-- Run this in your Supabase SQL Editor to fix double-deduction
-- =============================================

-- 1. CLEANUP ALL REDUNDANT TRIGGERS ON card_hold_records
-- We must drop every possible version from all previous SQL files
DROP TRIGGER IF EXISTS trg_sync_card_hold ON card_hold_records;
DROP TRIGGER IF EXISTS trg_sync_card_hold_to_balance ON card_hold_records;

-- 2. CREATE THE CONSOLIDATED SYNC FUNCTION
CREATE OR REPLACE FUNCTION sync_card_hold_v3()
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

    -- Update daily_accounts_status (Net Cash minus Hold, Hold Balance up)
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

-- 3. APPLY THE SINGLE OFFICIAL TRIGGER
CREATE TRIGGER trg_sync_card_hold_v3
AFTER INSERT OR UPDATE OR DELETE ON card_hold_records
FOR EACH ROW EXECUTE FUNCTION sync_card_hold_v3();

-- 4. OPTIONAL: ENSURE SALES TRIGGERS ARE ALSO CONSOLIDATED
-- (Drops old names to prevent triple counting)
DROP TRIGGER IF EXISTS trg_sync_sale_to_balance ON daily_sales;
DROP TRIGGER IF EXISTS trg_sync_sale_to_balance_v2 ON daily_sales;

CREATE OR REPLACE FUNCTION sync_daily_sale_v3()
RETURNS TRIGGER AS $$
DECLARE
    v_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_diff := NEW.total_amount;
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_diff := NEW.total_amount - OLD.total_amount;
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'DELETE') THEN
        v_diff := -OLD.total_amount;
        v_sale_date := OLD.sale_date;
    END IF;

    -- Add to total fuel sale AND to closing_cash initially (as if it was all cash)
    INSERT INTO daily_accounts_status (status_date, total_fuel_sale, closing_cash)
    VALUES (v_sale_date, GREATEST(0, v_diff), v_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_fuel_sale = COALESCE(daily_accounts_status.total_fuel_sale, 0) + v_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_sale_v3
AFTER INSERT OR UPDATE OR DELETE ON daily_sales
FOR EACH ROW EXECUTE FUNCTION sync_daily_sale_v3();
