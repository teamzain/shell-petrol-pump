-- =============================================
-- FIX MANUAL SALES FOR CARD SYSTEM
-- =============================================

-- 1. ADD COLUMNS TO manual_sales
ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS cash_payment_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS card_payment_amount NUMERIC(15, 2) DEFAULT 0;

-- 2. UPDATE SYNC TRIGGER FOR manual_sales
CREATE OR REPLACE FUNCTION sync_manual_sale_to_balance_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_total_diff NUMERIC;
    v_cash_diff NUMERIC;
    v_card_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    -- Extract date from sale_date timestamp
    IF (TG_OP = 'INSERT') THEN
        v_total_diff := NEW.total_amount;
        v_cash_diff := COALESCE(NEW.cash_payment_amount, NEW.total_amount);
        v_card_diff := COALESCE(NEW.card_payment_amount, 0);
        v_sale_date := NEW.sale_date::DATE;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_total_diff := NEW.total_amount - OLD.total_amount;
        v_cash_diff := COALESCE(NEW.cash_payment_amount, 0) - COALESCE(OLD.cash_payment_amount, OLD.total_amount);
        v_card_diff := COALESCE(NEW.card_payment_amount, 0) - COALESCE(OLD.card_payment_amount, 0);
        v_sale_date := NEW.sale_date::DATE;
    ELSIF (TG_OP = 'DELETE') THEN
        v_total_diff := -OLD.total_amount;
        v_cash_diff := -COALESCE(OLD.cash_payment_amount, OLD.total_amount);
        v_card_diff := -COALESCE(OLD.card_payment_amount, 0);
        v_sale_date := OLD.sale_date::DATE;
    END IF;

    -- Update daily_accounts_status
    INSERT INTO daily_accounts_status (status_date, total_lube_sale, closing_cash, total_card_hold)
    VALUES (v_sale_date, GREATEST(0, v_total_diff), v_cash_diff, v_card_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_lube_sale = COALESCE(daily_accounts_status.total_lube_sale, 0) + v_total_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_cash_diff,
        total_card_hold = COALESCE(daily_accounts_status.total_card_hold, 0) + v_card_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger
DROP TRIGGER IF EXISTS trg_sync_manual_sale_to_balance ON manual_sales;
CREATE TRIGGER trg_sync_manual_sale_to_balance
AFTER INSERT OR UPDATE OR DELETE ON manual_sales
FOR EACH ROW EXECUTE FUNCTION sync_manual_sale_to_balance_v2();
