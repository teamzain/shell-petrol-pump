-- =====================================================
-- Add Supplier Type
-- RUN THIS IN: Supabase → SQL Editor
-- =====================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_type TEXT DEFAULT 'company' CHECK (supplier_type IN ('company', 'local'));

-- To make sure the existing records default to company successfully:
UPDATE suppliers SET supplier_type = 'company' WHERE supplier_type IS NULL;
