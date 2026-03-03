-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tanks Table
CREATE TABLE IF NOT EXISTS tanks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- e.g. "Super Tank 1"
    product_id UUID REFERENCES products(id),
    capacity NUMERIC(12, 2) NOT NULL,
    dry_level NUMERIC(12, 2) NOT NULL DEFAULT 500, -- Minimum safe level
    current_level NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Link Dispensers to Tanks (Migration)
ALTER TABLE dispensers ADD COLUMN IF NOT EXISTS tank_id UUID REFERENCES tanks(id);

-- 3. Daily Expenses Table
CREATE TABLE IF NOT EXISTS daily_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category TEXT, -- e.g. "Staff Lunch", "Electricity"
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Lubricant Sales Table
-- For both loose and packed lubricants
CREATE TABLE IF NOT EXISTS lubricant_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    product_id UUID REFERENCES products(id),
    is_loose BOOLEAN DEFAULT false, -- true if sold by litre, false if packed
    pack_size TEXT, -- e.g. "4L", "5L"
    quantity NUMERIC(12, 2) NOT NULL, -- litres or units
    rate NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Daily Accounts Status (Cash/Bank Carry Forward)
CREATE TABLE IF NOT EXISTS daily_accounts_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_date DATE NOT NULL UNIQUE,
    opening_cash NUMERIC(12, 2) DEFAULT 0,
    closing_cash NUMERIC(12, 2) DEFAULT 0,
    opening_bank NUMERIC(12, 2) DEFAULT 0,
    closing_bank NUMERIC(12, 2) DEFAULT 0,
    shell_account_balance NUMERIC(12, 2) DEFAULT 0,
    total_fuel_sale NUMERIC(12, 2) DEFAULT 0,
    total_lube_sale NUMERIC(12, 2) DEFAULT 0,
    total_expenses NUMERIC(12, 2) DEFAULT 0,
    net_cash_sale NUMERIC(12, 2) DEFAULT 0,
    opening_balances_set BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Add some Lubricant specific fields to products if not there
ALTER TABLE products ADD COLUMN IF NOT EXISTS lubricant_type TEXT CHECK (lubricant_type IN ('loose', 'packed'));
-- For packed lubricants, we might have multiple pack sizes. 
-- In a simple system, each pack size can be a separate product, or we use a JSONB field.
-- For now, let's keep it simple: each pack size is a separate product entry.

-- 7. Add dry level warning trigger/check helper
CREATE OR REPLACE FUNCTION check_tank_dry_level()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_level < NEW.dry_level THEN
        -- We could insert a notification record here if a notifications table exists
        -- In this system, we'll just let the UI handle the warning based on the reading
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Function to finalize day (Carry Forward)
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
    v_expenses NUMERIC;
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
    SELECT SUM(amount) INTO v_expenses FROM daily_expenses WHERE expense_date = p_date;
    
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
        v_fuel_sale, v_lube_sale, v_expenses,
        (v_fuel_sale + v_lube_sale - v_shell_card - v_bank_card - v_expenses),
        (v_opening_cash + (v_fuel_sale + v_lube_sale - v_shell_card - v_bank_card - v_expenses)),
        (v_opening_bank + v_released_bank)
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
