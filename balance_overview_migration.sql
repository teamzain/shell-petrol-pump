-- =============================================
-- Add is_closed to daily_accounts_status
-- =============================================
ALTER TABLE daily_accounts_status ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false;
ALTER TABLE daily_accounts_status ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- =============================================
-- Ensure bank_cards and balance_transactions tables exist
-- (Run bank_management_schema.sql first if not done)
-- =============================================
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

CREATE TABLE IF NOT EXISTS bank_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    card_number TEXT,
    tax_percentage NUMERIC(5, 2) DEFAULT 0,
    opening_balance NUMERIC(15, 2) DEFAULT 0,
    current_balance NUMERIC(15, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balance_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_to_bank', 'bank_to_cash', 'add_cash', 'add_bank', 'transfer_to_supplier')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    bank_account_id UUID REFERENCES bank_accounts(id),
    supplier_id UUID REFERENCES suppliers(id),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to bank_accounts" ON bank_accounts;
CREATE POLICY "Allow authenticated full access to bank_accounts" ON bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to bank_cards" ON bank_cards;
CREATE POLICY "Allow authenticated full access to bank_cards" ON bank_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to balance_transactions" ON balance_transactions;
CREATE POLICY "Allow authenticated full access to balance_transactions" ON balance_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Helper RPC for bank balance adjustment
CREATE OR REPLACE FUNCTION adjust_bank_balance(p_bank_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE bank_accounts
  SET current_balance = current_balance + p_amount,
      updated_at = now()
  WHERE id = p_bank_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
