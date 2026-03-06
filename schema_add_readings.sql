-- ADD METER READINGS TO DAILY SALES
-- Run this in Supabase SQL Editor

DO $$ 
BEGIN 
    -- 1. Add opening_reading to daily_sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'opening_reading') THEN
        ALTER TABLE public.daily_sales ADD COLUMN opening_reading NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- 2. Add closing_reading to daily_sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'closing_reading') THEN
        ALTER TABLE public.daily_sales ADD COLUMN closing_reading NUMERIC(15, 2) DEFAULT 0;
    END IF;
END $$;

-- Reload cache
NOTIFY pgrst, 'reload schema';
