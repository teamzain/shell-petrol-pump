-- =============================================
-- REFINED CARD TRIGGERS FOR CONSOLIDATED ENTRY
-- =============================================

-- 1. TRIGGER ON card_hold_records TO ADJUST CASH & HOLD TOTALS
-- This ensures when a daily card summary is added, it correctly
-- reduces the "Closing Cash" (Cash in Hand) and increases "Total Card Hold"
-- =============================================
CREATE OR REPLACE FUNCTION sync_card_hold_to_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_amount_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_amount_diff := NEW.hold_amount;
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_amount_diff := NEW.hold_amount - OLD.hold_amount;
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'DELETE') THEN
        v_amount_diff := -OLD.hold_amount;
        v_sale_date := OLD.sale_date;
    END IF;

    -- Update daily_accounts_status
    -- Subtract from closing_cash (convert cash to hold)
    -- Add to total_card_hold
    INSERT INTO daily_accounts_status (status_date, closing_cash, total_card_hold)
    VALUES (v_sale_date, -v_amount_diff, v_amount_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) - v_amount_diff,
        total_card_hold = COALESCE(daily_accounts_status.total_card_hold, 0) + v_amount_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_card_hold_to_balance ON card_hold_records;
CREATE TRIGGER trg_sync_card_hold_to_balance
AFTER INSERT OR UPDATE OR DELETE ON card_hold_records
FOR EACH ROW EXECUTE FUNCTION sync_card_hold_to_balance();

-- 2. REVERT SALES TRIGGERS TO TREAT EVERYTHING AS CASH INITIALLY
-- =============================================

-- Fuel Sales Sync
CREATE OR REPLACE FUNCTION sync_daily_sale_to_balance_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_total_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_total_diff := NEW.total_amount;
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_total_diff := NEW.total_amount - OLD.total_amount;
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'DELETE') THEN
        v_total_diff := -OLD.total_amount;
        v_sale_date := OLD.sale_date;
    END IF;

    -- Treat everything as cash (closing_cash) initially
    INSERT INTO daily_accounts_status (status_date, total_fuel_sale, closing_cash)
    VALUES (v_sale_date, GREATEST(0, v_total_diff), v_total_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_fuel_sale = COALESCE(daily_accounts_status.total_fuel_sale, 0) + v_total_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_total_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Manual Sales Sync (including Lubricants)
CREATE OR REPLACE FUNCTION sync_manual_sale_to_balance_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_total_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_total_diff := NEW.total_amount;
        v_sale_date := NEW.sale_date::DATE;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_total_diff := NEW.total_amount - OLD.total_amount;
        v_sale_date := NEW.sale_date::DATE;
    ELSIF (TG_OP = 'DELETE') THEN
        v_total_diff := -OLD.total_amount;
        v_sale_date := OLD.sale_date::DATE;
    END IF;

    -- Update daily_accounts_status (Lube sale + Cash)
    INSERT INTO daily_accounts_status (status_date, total_lube_sale, closing_cash)
    VALUES (v_sale_date, GREATEST(0, v_total_diff), v_total_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_lube_sale = COALESCE(daily_accounts_status.total_lube_sale, 0) + v_total_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_total_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
