-- Final Fix for Nozzles Table Schema
ALTER TABLE nozzles 
ADD COLUMN IF NOT EXISTS nozzle_side TEXT,
ADD COLUMN IF NOT EXISTS initial_reading NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_reading NUMERIC DEFAULT 0;

-- Ensure nozzle_number is TEXT to allow names like "Nozzle 1" or "N-1A"
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'nozzles' 
        AND column_name = 'nozzle_number' 
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE nozzles ALTER COLUMN nozzle_number TYPE TEXT;
    END IF;
END $$;
