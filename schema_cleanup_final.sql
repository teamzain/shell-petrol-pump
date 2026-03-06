-- FINAL ROBUST SCHEMA CLEANUP
-- Run this if you are still seeing "null value" or "column not found" errors

-- 1. Ensure daily_sales is aligned with the NEW code
DO $$ 
DECLARE 
    col_name text;
BEGIN 
    -- First, ensure the NEW columns definitely exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'quantity') THEN
        ALTER TABLE public.daily_sales ADD COLUMN quantity NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'unit_price') THEN
        ALTER TABLE public.daily_sales ADD COLUMN unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Generic Cleanup: Make EVERY other column nullable (legacy compatibility)
    -- This fixes: payment_type, rate_per_liter, total_amount, liters_sold, etc.
    FOR col_name IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'daily_sales' 
        AND column_name NOT IN ('id', 'nozzle_id', 'sale_date', 'quantity', 'unit_price', 'revenue', 'cogs', 'gross_profit', 'is_overnight', 'created_at', 'payment_method')
    LOOP
        EXECUTE format('ALTER TABLE public.daily_sales ALTER COLUMN %I DROP NOT NULL', col_name);
    END LOOP;
END $$;

-- 2. Ensure nozzles table is ready
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'last_reading') THEN
        ALTER TABLE public.nozzles ADD COLUMN last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 3. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
