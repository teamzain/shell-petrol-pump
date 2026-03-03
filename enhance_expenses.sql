-- Enhance expenses
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name TEXT NOT NULL UNIQUE,
    category_type TEXT DEFAULT 'operating', -- operating, fixed, maintenance, other
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default categories if empty
INSERT INTO expense_categories (category_name, category_type)
VALUES 
('Staff Salary', 'operating'),
('Electricity Bill', 'fixed'),
('Generator Fuel', 'operating'),
('Stationery', 'operating'),
('Site Maintenance', 'maintenance')
ON CONFLICT (category_name) DO NOTHING;

-- Extend daily_expenses
ALTER TABLE daily_expenses 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES expense_categories(id),
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS paid_to TEXT,
ADD COLUMN IF NOT EXISTS invoice_number TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;
