-- Comprehensive Schema Fix for Nozzle Sales logic

-- 1. Fix 'nozzles' table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'last_reading') THEN
        ALTER TABLE public.nozzles ADD COLUMN last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 2. Fix 'daily_sales' table
DO $$ 
BEGIN 
    -- Add 'cogs' if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'cogs') THEN
        ALTER TABLE public.daily_sales ADD COLUMN cogs NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add 'gross_profit' if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'gross_profit') THEN
        ALTER TABLE public.daily_sales ADD COLUMN gross_profit NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add 'unit_price' if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'unit_price') THEN
        ALTER TABLE public.daily_sales ADD COLUMN unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    -- Add 'is_overnight' if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'is_overnight') THEN
        ALTER TABLE public.daily_sales ADD COLUMN is_overnight BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. Refresh PostgREST cache (Supabase internal)
NOTIFY pgrst, 'reload schema';
