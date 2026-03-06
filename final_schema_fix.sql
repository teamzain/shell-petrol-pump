-- FINAL COMPREHENSIVE SCHEMA FIX
-- Run this in Supabase SQL Editor if you see "column not found" errors

-- 1. FIX NOZZLES TABLE
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'last_reading') THEN
        ALTER TABLE public.nozzles ADD COLUMN last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 2. FIX DAILY_SALES TABLE (Ensuring all columns for Automated Nozzle Sales)
DO $$ 
BEGIN 
    -- Sale Date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'sale_date') THEN
        ALTER TABLE public.daily_sales ADD COLUMN sale_date DATE NOT NULL DEFAULT CURRENT_DATE;
    END IF;

    -- Quantity
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'quantity') THEN
        ALTER TABLE public.daily_sales ADD COLUMN quantity NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Unit Price
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'unit_price') THEN
        ALTER TABLE public.daily_sales ADD COLUMN unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Revenue
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'revenue') THEN
        ALTER TABLE public.daily_sales ADD COLUMN revenue NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- COGS
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'cogs') THEN
        ALTER TABLE public.daily_sales ADD COLUMN cogs NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Gross Profit
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'gross_profit') THEN
        ALTER TABLE public.daily_sales ADD COLUMN gross_profit NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- is_overnight
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'is_overnight') THEN
        ALTER TABLE public.daily_sales ADD COLUMN is_overnight BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. FORCE CACHE RELOAD
-- This tells Supabase/PostgREST to look at the table again immediately
NOTIFY pgrst, 'reload schema';
