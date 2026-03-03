-- ==========================================
-- Schema Updates for Bank Accounts & Cards
-- ==========================================

-- 1. Ensure Bank Accounts table exists with necessary fields
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

-- 2. Create Bank Cards table
-- Tracks individual cards, their tax percentages, and balances
CREATE TABLE IF NOT EXISTS bank_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    card_number TEXT,
    tax_percentage NUMERIC(5, 2) DEFAULT 0, -- Tax deduction percentage
    opening_balance NUMERIC(15, 2) DEFAULT 0,
    current_balance NUMERIC(15, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Balance Transactions table
-- Tracks manual movements of funds
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

-- 3b. Add bank_card_id to balance_transactions (for card-based transactions)
ALTER TABLE balance_transactions
ADD COLUMN IF NOT EXISTS bank_card_id UUID REFERENCES bank_cards(id);

-- 4. Enable RLS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies
DROP POLICY IF EXISTS "Allow authenticated full access to bank_accounts" ON bank_accounts;
CREATE POLICY "Allow authenticated full access to bank_accounts" ON bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to bank_cards" ON bank_cards;
CREATE POLICY "Allow authenticated full access to bank_cards" ON bank_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to balance_transactions" ON balance_transactions;
CREATE POLICY "Allow authenticated full access to balance_transactions" ON balance_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Add tax_percentage to suppliers if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='tax_percentage') THEN
        ALTER TABLE suppliers ADD COLUMN tax_percentage NUMERIC DEFAULT 0;
    END IF;
END $$;
-- Create Supplier Cards table
CREATE TABLE IF NOT EXISTS supplier_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    card_number TEXT,
    tax_percentage NUMERIC(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add supplier_card_id to balance_transactions
ALTER TABLE balance_transactions
ADD COLUMN IF NOT EXISTS supplier_card_id UUID REFERENCES supplier_cards(id);

-- Enable RLS for supplier_cards
ALTER TABLE supplier_cards ENABLE ROW LEVEL SECURITY;

-- Policy for supplier_cards
DROP POLICY IF EXISTS "Allow authenticated full access to supplier_cards" ON supplier_cards;
CREATE POLICY "Allow authenticated full access to supplier_cards" ON supplier_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);
