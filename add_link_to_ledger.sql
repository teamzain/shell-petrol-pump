-- =============================================
-- LINK CARD HOLDS TO SUPPLIER LEDGER
-- Run this in your Supabase SQL Editor
-- =============================================

-- Add card_hold_id to link transactions directly to holds
ALTER TABLE public.company_account_transactions 
ADD COLUMN IF NOT EXISTS card_hold_id UUID REFERENCES public.card_hold_records(id);

-- Optional: Index for better join performance
CREATE INDEX IF NOT EXISTS idx_ledger_card_hold ON public.company_account_transactions(card_hold_id);
