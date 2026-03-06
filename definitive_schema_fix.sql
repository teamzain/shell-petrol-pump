-- THE DEFINITIVE FIX SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR TO FIX ALL "COLUMN NOT FOUND" ERRORS

-- 1. ENSURE DAILY_SALES TABLE HAS ALL REQUIRED COLUMNS
DO $$ 
BEGIN 
    -- Payment Method
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'payment_method') THEN
        ALTER TABLE public.daily_sales ADD COLUMN payment_method TEXT DEFAULT 'cash';
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

    -- Overnight
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'is_overnight') THEN
        ALTER TABLE public.daily_sales ADD COLUMN is_overnight BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. DISABLE CONSTRAINTS ON LEGACY COLUMNS (Relaxing the database)
DO $$ 
DECLARE 
    col_name text;
BEGIN 
    -- This looks for any extra columns that might have 'NOT NULL' constraints and removes them
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

-- 3. ENSURE NOZZLES TABLE IS CORRECT
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'last_reading') THEN
        ALTER TABLE public.nozzles ADD COLUMN last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 4. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
