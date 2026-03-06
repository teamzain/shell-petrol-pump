-- CONSOLIDATE EXISTING SALES AND PREVENT FUTURE DUPLICATES
-- Run this in Supabase SQL Editor

-- 1. Merge existing duplicates into a single row per nozzle per day
-- We take the MIN opening, MAX closing, and SUM everything else
CREATE TEMP TABLE consolidated_sales AS
SELECT 
    nozzle_id, 
    sale_date, 
    SUM(quantity) as total_qty,
    MAX(unit_price) as latest_price,
    SUM(revenue) as total_rev,
    SUM(cogs) as total_cogs,
    SUM(gross_profit) as total_profit,
    MIN(opening_reading) as day_opening,
    MAX(closing_reading) as day_closing,
    BOOL_OR(is_overnight) as was_overnight
FROM public.daily_sales
GROUP BY nozzle_id, sale_date;

-- 2. Clear the table (safely)
DELETE FROM public.daily_sales;

-- 3. Add the unique constraint to prevent this happening again
ALTER TABLE public.daily_sales ADD CONSTRAINT unique_nozzle_day UNIQUE (nozzle_id, sale_date);

-- 4. Re-insert the consolidated data
INSERT INTO public.daily_sales (
    nozzle_id, 
    sale_date, 
    quantity, 
    unit_price, 
    revenue, 
    cogs, 
    gross_profit, 
    opening_reading, 
    closing_reading, 
    is_overnight,
    payment_method
)
SELECT 
    nozzle_id, 
    sale_date, 
    total_qty, 
    latest_price, 
    total_rev, 
    total_cogs, 
    total_profit, 
    day_opening, 
    day_closing, 
    was_overnight,
    'cash'
FROM consolidated_sales;

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
