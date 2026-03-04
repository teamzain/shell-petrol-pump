-- consolidated fix for missing expense and bank tables
-- enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Ensure expense_categories exists
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name TEXT NOT NULL UNIQUE,
    category_type TEXT DEFAULT 'operating', -- operating, fixed, maintenance, other
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default categories
INSERT INTO expense_categories (category_name, category_type)
VALUES 
('Staff Salary', 'operating'),
('Electricity Bill', 'fixed'),
('Generator Fuel', 'operating'),
('Stationery', 'operating'),
('Site Maintenance', 'maintenance')
ON CONFLICT (category_name) DO NOTHING;

-- 2. Ensure daily_expenses exists and has correct columns
CREATE TABLE IF NOT EXISTS daily_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Explicitly add columns and foreign keys to handle cases where table already existed
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_expenses' AND column_name='category_id') THEN
        ALTER TABLE daily_expenses ADD COLUMN category_id UUID REFERENCES expense_categories(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_expenses' AND column_name='bank_account_id') THEN
        ALTER TABLE daily_expenses ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_expenses' AND column_name='payment_method') THEN
        ALTER TABLE daily_expenses ADD COLUMN payment_method TEXT DEFAULT 'cash';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_expenses' AND column_name='paid_to') THEN
        ALTER TABLE daily_expenses ADD COLUMN paid_to TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_expenses' AND column_name='invoice_number') THEN
        ALTER TABLE daily_expenses ADD COLUMN invoice_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_expenses' AND column_name='notes') THEN
        ALTER TABLE daily_expenses ADD COLUMN notes TEXT;
    END IF;
END $$;

-- 3. Ensure bank_accounts exists
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_name TEXT NOT NULL,
    account_number TEXT,
    bank_name TEXT,
    opening_balance NUMERIC(15, 2) DEFAULT 0,
    current_balance NUMERIC(15, 2) DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure RLS is enabled and policies are set (Relaxed for this stage)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to expense_categories" ON expense_categories;
CREATE POLICY "Allow authenticated full access to expense_categories" ON expense_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to daily_expenses" ON daily_expenses;
CREATE POLICY "Allow authenticated full access to daily_expenses" ON daily_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to bank_accounts" ON bank_accounts;
CREATE POLICY "Allow authenticated full access to bank_accounts" ON bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Improved Finalization logic to handle cash vs bank expenses
CREATE OR REPLACE FUNCTION finalize_daily_status(
    p_date DATE,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_status_id UUID;
    v_opening_cash NUMERIC;
    v_opening_bank NUMERIC;
    v_prev_date DATE := p_date - INTERVAL '1 day';
    v_fuel_sale NUMERIC;
    v_lube_sale NUMERIC;
    v_expenses NUMERIC; -- Cash expenses
    v_bank_expenses NUMERIC;
    v_shell_card NUMERIC;
    v_bank_card NUMERIC;
    v_released_bank NUMERIC;
BEGIN
    -- 1. Get opening balances from yesterday's closing
    SELECT closing_cash, closing_bank INTO v_opening_cash, v_opening_bank
    FROM daily_accounts_status
    WHERE status_date = v_prev_date;

    v_opening_cash := COALESCE(v_opening_cash, 0);
    v_opening_bank := COALESCE(v_opening_bank, 0);

    -- 2. Calculate today's totals
    SELECT SUM(total_amount) INTO v_fuel_sale FROM daily_sales WHERE sale_date = p_date;
    SELECT SUM(total_amount) INTO v_lube_sale FROM lubricant_sales WHERE sale_date = p_date;
    
    -- Split expenses into cash and bank
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses FROM daily_expenses 
    WHERE expense_date = p_date AND (payment_method = 'cash' OR payment_method IS NULL);
    
    SELECT COALESCE(SUM(amount), 0) INTO v_bank_expenses FROM daily_expenses 
    WHERE expense_date = p_date AND payment_method = 'bank_transfer';
    
    -- Card payments from today
    SELECT SUM(total_amount) INTO v_shell_card FROM daily_sales 
    WHERE sale_date = p_date AND payment_type = 'supplier_card';
    
    SELECT SUM(total_amount) INTO v_bank_card FROM daily_sales 
    WHERE sale_date = p_date AND payment_type = 'bank_card';

    -- Released payments today (adds to bank)
    SELECT SUM(hold_amount) INTO v_released_bank FROM card_hold_records
    WHERE actual_release_date = p_date AND status = 'released';

    v_fuel_sale := COALESCE(v_fuel_sale, 0);
    v_lube_sale := COALESCE(v_lube_sale, 0);
    v_expenses := COALESCE(v_expenses, 0);
    v_shell_card := COALESCE(v_shell_card, 0);
    v_bank_card := COALESCE(v_bank_card, 0);
    v_released_bank := COALESCE(v_released_bank, 0);

    -- 3. Update or Insert Daily Status
    INSERT INTO daily_accounts_status (
        status_date, opening_cash, opening_bank, 
        total_fuel_sale, total_lube_sale, total_expenses,
        net_cash_sale,
        closing_cash,
        closing_bank
    ) VALUES (
        p_date, v_opening_cash, v_opening_bank,
        v_fuel_sale, v_lube_sale, (v_expenses + v_bank_expenses),
        (v_fuel_sale + v_lube_sale - v_shell_card - v_bank_card - v_expenses),
        (v_opening_cash + (v_fuel_sale + v_lube_sale - v_shell_card - v_bank_card - v_expenses)),
        (v_opening_bank + v_released_bank - v_bank_expenses)
    )
    ON CONFLICT (status_date) DO UPDATE SET
        opening_cash = EXCLUDED.opening_cash,
        opening_bank = EXCLUDED.opening_bank,
        total_fuel_sale = EXCLUDED.total_fuel_sale,
        total_lube_sale = EXCLUDED.total_lube_sale,
        total_expenses = EXCLUDED.total_expenses,
        net_cash_sale = EXCLUDED.net_cash_sale,
        closing_cash = EXCLUDED.closing_cash,
        closing_bank = EXCLUDED.closing_bank,
        updated_at = now()
    RETURNING id INTO v_status_id;

    RETURN v_status_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
