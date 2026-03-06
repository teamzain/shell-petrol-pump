-- =============================================
-- BALANCE OVERVIEW FINAL FIX
-- =============================================

-- 1. FIX balance_transactions SCHEMA
-- =============================================
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS bank_card_id UUID REFERENCES bank_cards(id);
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS supplier_card_id UUID REFERENCES supplier_cards(id);
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS is_opening BOOLEAN DEFAULT FALSE;

-- Update transaction_type constraint to include missing types
ALTER TABLE balance_transactions DROP CONSTRAINT IF EXISTS balance_transactions_transaction_type_check;
ALTER TABLE balance_transactions ADD CONSTRAINT balance_transactions_transaction_type_check 
CHECK (transaction_type IN ('cash_to_bank', 'bank_to_cash', 'add_cash', 'add_bank', 'transfer_to_supplier', 'supplier_to_bank'));

-- 2. SALES SYNCHRONIZATION TRIGGER (FOR FUEL)
-- =============================================
CREATE OR REPLACE FUNCTION sync_daily_sale_to_balance()
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

    -- Ensure daily_accounts_status exists
    INSERT INTO daily_accounts_status (status_date, total_fuel_sale, closing_cash)
    VALUES (v_sale_date, GREATEST(0, v_diff), v_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_fuel_sale = COALESCE(daily_accounts_status.total_fuel_sale, 0) + v_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_sale_to_balance ON daily_sales;
CREATE TRIGGER trg_sync_sale_to_balance
AFTER INSERT OR UPDATE OR DELETE ON daily_sales
FOR EACH ROW EXECUTE FUNCTION sync_daily_sale_to_balance();

-- 3. LUBRICANT SYNCHRONIZATION TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION sync_lube_sale_to_balance()
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

    -- Ensure daily_accounts_status exists
    INSERT INTO daily_accounts_status (status_date, total_lube_sale, closing_cash)
    VALUES (v_sale_date, GREATEST(0, v_diff), v_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_lube_sale = COALESCE(daily_accounts_status.total_lube_sale, 0) + v_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_lube_to_balance ON lubricant_sales;
CREATE TRIGGER trg_sync_lube_to_balance
AFTER INSERT OR UPDATE OR DELETE ON lubricant_sales
FOR EACH ROW EXECUTE FUNCTION sync_lube_sale_to_balance();

-- 4. ENSURE net_cash_sale CALCULATION IS CONSISTENT
-- We can add a generated column OR just rely on the UI/Finalization logic.
-- Given the current complex triggers, it's safer to have a trigger update it or just query it.

-- 5. REPAIR EXISTING DATA (Optional but recommended)
-- This will sync existing sales to daily_accounts_status for today/recent days
-- RUN WITH CAUTION: ONLY IF BALANCE IS CURRENTLY 0
-- UPDATE daily_accounts_status 
-- SET 
--     total_fuel_sale = (SELECT COALESCE(SUM(total_amount), 0) FROM daily_sales WHERE sale_date = daily_accounts_status.status_date),
--     total_lube_sale = (SELECT COALESCE(SUM(total_amount), 0) FROM lubricant_sales WHERE sale_date = daily_accounts_status.status_date)
-- WHERE status_date >= CURRENT_DATE - INTERVAL '7 days';

-- Recalculate closing_cash based on sales - expenses (Simplified repair)
-- UPDATE daily_accounts_status
-- SET closing_cash = opening_cash + total_fuel_sale + total_lube_sale - total_expenses
-- WHERE status_date >= CURRENT_DATE - INTERVAL '7 days' AND NOT is_closed;
