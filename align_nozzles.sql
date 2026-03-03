-- Align Nozzles table with UI
ALTER TABLE nozzles 
ADD COLUMN IF NOT EXISTS nozzle_side TEXT,
ADD COLUMN IF NOT EXISTS initial_reading NUMERIC DEFAULT 0;

-- Change nozzle_number to TEXT if it's currently INT
ALTER TABLE nozzles ALTER COLUMN nozzle_number TYPE TEXT;
