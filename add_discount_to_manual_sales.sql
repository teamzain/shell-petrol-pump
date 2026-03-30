-- =============================================
-- ADD DISCOUNT COLUMNS TO manual_sales
-- =============================================

ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT NULL;
-- 'percentage' or 'amount'

ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15, 2) DEFAULT 0;
-- The raw value entered (e.g. 10 for 10% or 50 for Rs.50)

ALTER TABLE manual_sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15, 2) DEFAULT 0;
-- The calculated discount in rupees (always stored as money amount)
