-- NUCLEAR METER REPAIR SCRIPT
-- Run this in Supabase SQL Editor to fix the 0 values

-- 1. Ensure columns exist and have correct types
ALTER TABLE public.daily_sales 
ADD COLUMN IF NOT EXISTS opening_reading NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_reading NUMERIC(15, 2) DEFAULT 0;

-- 2. Repair existing data (Force populate from quantity if they are currently 0)
-- This will set closing as quantity and opening as 0 for older rows
UPDATE public.daily_sales 
SET 
    closing_reading = quantity, 
    opening_reading = 0 
WHERE 
    (closing_reading = 0 OR closing_reading IS NULL)
    AND (opening_reading = 0 OR opening_reading IS NULL)
    AND quantity > 0;

-- 3. Synchronize Nozzles table (Make sure last_reading matches latest sale)
UPDATE public.nozzles n
SET last_reading = COALESCE(
    (SELECT closing_reading FROM public.daily_sales s WHERE s.nozzle_id = n.id ORDER BY s.sale_date DESC, s.created_at DESC LIMIT 1),
    n.initial_reading
);

-- 4. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
