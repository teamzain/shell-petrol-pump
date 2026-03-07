-- SQL Script to fix missing admin_pin column in pump_config
-- Run this in your Supabase SQL Editor

-- 1. Add admin_pin column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pump_config' AND column_name = 'admin_pin') THEN
        ALTER TABLE public.pump_config ADD COLUMN admin_pin TEXT;
    END IF;
END $$;

-- 2. Add updated_at if missing (useful for the update logic)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pump_config' AND column_name = 'updated_at') THEN
        ALTER TABLE public.pump_config ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- 3. Reload schema cache to ensure PostgREST sees the change immediately
NOTIFY pgrst, 'reload schema';
