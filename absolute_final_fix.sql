-- THE ABSOLUTE FINAL FIX SCRIPT (v2)
-- RUN THIS IN SUPABASE SQL EDITOR TO RESOLVE ALL ERRORS

-- 1. FIX 'daily_sales' TABLE
DO $$ 
BEGIN 
    -- Required Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'payment_method') THEN
        ALTER TABLE public.daily_sales ADD COLUMN payment_method TEXT DEFAULT 'cash';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'quantity') THEN
        ALTER TABLE public.daily_sales ADD COLUMN quantity NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'unit_price') THEN
        ALTER TABLE public.daily_sales ADD COLUMN unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'revenue') THEN
        ALTER TABLE public.daily_sales ADD COLUMN revenue NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'cogs') THEN
        ALTER TABLE public.daily_sales ADD COLUMN cogs NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'gross_profit') THEN
        ALTER TABLE public.daily_sales ADD COLUMN gross_profit NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_sales' AND column_name = 'is_overnight') THEN
        ALTER TABLE public.daily_sales ADD COLUMN is_overnight BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. RELAX CONSTRAINTS ON ALL OTHER daily_sales COLUMNS
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

-- 3. FIX 'nozzles' TABLE
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'last_reading') THEN
        ALTER TABLE public.nozzles ADD COLUMN last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 4. FIX 'stock_movements' TABLE
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'reference') THEN
        ALTER TABLE public.stock_movements ADD COLUMN reference TEXT;
    END IF;
END $$;

-- 5. ENSURE nozzle_readings UNIQUE CONSTRAINT EXISTS (for UPSERT)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nozzle_readings_nozzle_id_reading_date_reading_type_key') THEN
        ALTER TABLE public.nozzle_readings ADD CONSTRAINT nozzle_readings_nozzle_id_reading_date_reading_type_key UNIQUE(nozzle_id, reading_date, reading_type);
    END IF;
END $$;

-- 6. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
