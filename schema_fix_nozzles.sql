-- Ensure the column last_reading exists in nozzles table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nozzles' AND column_name = 'last_reading') THEN
        ALTER TABLE public.nozzles ADD COLUMN last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Update nozzle_readings to be simpler if needed
-- (Actually the current schema is fine, we just use 'closing' for all daily entries)

-- Re-verify RLS
ALTER TABLE public.nozzles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated full access to nozzles" ON public.nozzles;
CREATE POLICY "Allow authenticated full access to nozzles" ON public.nozzles FOR ALL TO authenticated USING (true) WITH CHECK (true);
