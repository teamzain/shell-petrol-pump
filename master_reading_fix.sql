-- MASTER REPAIR SCRIPT: FUEL READINGS & DATA FIX
-- Run this in Supabase SQL Editor

-- 1. Ensure Columns Exist (Definitive)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'opening_reading') THEN
        ALTER TABLE public.daily_sales ADD COLUMN opening_reading NUMERIC(15, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'closing_reading') THEN
        ALTER TABLE public.daily_sales ADD COLUMN closing_reading NUMERIC(15, 2) DEFAULT 0;
    END IF;
END $$;

-- 2. Repair Existing Data (Try to fill the 0s for today's sales)
-- This logic assumes that if they are 0, we can at least show the quantity as the closing reading
-- for the first transaction and keep them consistent.
UPDATE public.daily_sales 
SET 
    closing_reading = quantity, 
    opening_reading = 0 
WHERE 
    closing_reading = 0 
    AND opening_reading = 0 
    AND quantity > 0;

-- 3. Relax all constraints again to be safe
DO $$ 
DECLARE 
    col_name text;
BEGIN 
    FOR col_name IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_sales' 
        AND is_nullable = 'NO'
        AND column_name NOT IN ('id', 'nozzle_id', 'sale_date', 'quantity', 'unit_price', 'revenue', 'cogs', 'gross_profit')
    LOOP
        EXECUTE format('ALTER TABLE public.daily_sales ALTER COLUMN %I DROP NOT NULL', col_name);
    END LOOP;
END $$;

-- 4. Force Reload Schema
NOTIFY pgrst, 'reload schema';
