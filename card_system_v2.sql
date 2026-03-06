-- =============================================
-- CARD PAYMENT HOLD SYSTEM V2
-- =============================================

-- 1. UPDATE daily_sales TABLE
-- =============================================
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS cash_payment_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS card_payment_amount NUMERIC(15, 2) DEFAULT 0;

-- 2. CREATE card_hold_records TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS card_hold_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sale_id UUID REFERENCES daily_sales(id) ON DELETE CASCADE,
    card_type TEXT CHECK (card_type IN ('shell_card', 'bank_card', 'other')),
    bank_card_id UUID REFERENCES bank_cards(id),
    supplier_card_id UUID REFERENCES supplier_cards(id),
    amount NUMERIC(15, 2) NOT NULL,
    tax_percentage NUMERIC(5, 2) DEFAULT 0,
    tax_amount NUMERIC(15, 2) DEFAULT 0,
    net_amount NUMERIC(15, 2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'released', 'cancelled')),
    released_at TIMESTAMPTZ,
    bank_account_id UUID REFERENCES bank_accounts(id), -- Target bank when released
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE card_hold_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access to card_hold_records" ON card_hold_records;
CREATE POLICY "Allow authenticated full access to card_hold_records" ON card_hold_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. UPDATE daily_accounts_status TABLE
-- =============================================
ALTER TABLE daily_accounts_status ADD COLUMN IF NOT EXISTS total_card_hold NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE daily_accounts_status ADD COLUMN IF NOT EXISTS total_card_received NUMERIC(15, 2) DEFAULT 0;

-- 4. REFINED SALES SYNCHRONIZATION TRIGGER (FOR NET CASH)
-- =============================================
CREATE OR REPLACE FUNCTION sync_daily_sale_to_balance_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_total_diff NUMERIC;
    v_cash_diff NUMERIC;
    v_card_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_total_diff := NEW.total_amount;
        v_cash_diff := COALESCE(NEW.cash_payment_amount, NEW.total_amount); -- Default to cash if not specified
        v_card_diff := COALESCE(NEW.card_payment_amount, 0);
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_total_diff := NEW.total_amount - OLD.total_amount;
        v_cash_diff := COALESCE(NEW.cash_payment_amount, 0) - COALESCE(OLD.cash_payment_amount, OLD.total_amount);
        v_card_diff := COALESCE(NEW.card_payment_amount, 0) - COALESCE(OLD.card_payment_amount, 0);
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'DELETE') THEN
        v_total_diff := -OLD.total_amount;
        v_cash_diff := -COALESCE(OLD.cash_payment_amount, OLD.total_amount);
        v_card_diff := -COALESCE(OLD.card_payment_amount, 0);
        v_sale_date := OLD.sale_date;
    END IF;

    -- Ensure daily_accounts_status exists
    INSERT INTO daily_accounts_status (status_date, total_fuel_sale, closing_cash, total_card_hold)
    VALUES (v_sale_date, GREATEST(0, v_total_diff), v_cash_diff, v_card_diff)
    ON CONFLICT (status_date) DO UPDATE SET
        total_fuel_sale = COALESCE(daily_accounts_status.total_fuel_sale, 0) + v_total_diff,
        closing_cash = COALESCE(daily_accounts_status.closing_cash, 0) + v_cash_diff,
        total_card_hold = COALESCE(daily_accounts_status.total_card_hold, 0) + v_card_diff,
        updated_at = now();

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger
DROP TRIGGER IF EXISTS trg_sync_sale_to_balance ON daily_sales;
CREATE TRIGGER trg_sync_sale_to_balance
AFTER INSERT OR UPDATE OR DELETE ON daily_sales
FOR EACH ROW EXECUTE FUNCTION sync_daily_sale_to_balance_v2();

-- 5. LUBE SYNC REMAINS MOSTLY CASH FOR NOW (Simplification)
-- Unless user wants card for lube too. But usually it's nozzle sales that have cards mainly.
-- For consistency, adding same columns to lubricant_sales if they don't exist
ALTER TABLE lubricant_sales ADD COLUMN IF NOT EXISTS cash_payment_amount NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE lubricant_sales ADD COLUMN IF NOT EXISTS card_payment_amount NUMERIC(15, 2) DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_lube_sale_to_balance_v2()
RETURNS TRIGGER AS $$
DECLARE
    v_total_diff NUMERIC;
    v_cash_diff NUMERIC;
    v_card_diff NUMERIC;
    v_sale_date DATE;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_total_diff := NEW.total_amount;
        v_cash_diff := COALESCE(NEW.cash_payment_amount, NEW.total_amount);
        v_card_diff := COALESCE(NEW.card_payment_amount, 0);
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_total_diff := NEW.total_amount - OLD.total_amount;
        v_cash_diff := COALESCE(NEW.cash_payment_amount, 0) - COALESCE(OLD.cash_payment_amount, OLD.total_amount);
        v_card_diff := COALESCE(NEW.card_payment_amount, 0) - COALESCE(OLD.card_payment_amount, 0);
        v_sale_date := NEW.sale_date;
    ELSIF (TG_OP = 'DELETE') THEN
        v_total_diff := -OLD.total_amount;
        v_cash_diff := -COALESCE(OLD.cash_payment_amount, OLD.total_amount);
        v_card_diff := -COALESCE(OLD.card_payment_amount, 0);
        v_sale_date := OLD.sale_date;
    END IF;

    -- Ensure daily_accounts_status exists
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
DROP TRIGGER IF EXISTS trg_sync_lube_to_balance ON lubricant_sales;
CREATE TRIGGER trg_sync_lube_to_balance
AFTER INSERT OR UPDATE OR DELETE ON lubricant_sales
FOR EACH ROW EXECUTE FUNCTION sync_lube_sale_to_balance_v2();
