-- Table to store tank reconciliation records from dip chart readings
CREATE TABLE IF NOT EXISTS tank_reconciliation_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tank_id UUID REFERENCES tanks(id) NOT NULL,
    reading_date DATE NOT NULL,
    dip_mm NUMERIC(12, 2) NOT NULL,
    dip_volume NUMERIC(12, 2) NOT NULL,
    current_stock NUMERIC(12, 2) NOT NULL, -- System stock at time of reading
    gain_amount NUMERIC(12, 2) DEFAULT 0,
    loss_amount NUMERIC(12, 2) DEFAULT 0,
    actual_stock NUMERIC(12, 2) NOT NULL, -- The physical stock used to update the system
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance on date filtering
CREATE INDEX IF NOT EXISTS idx_tank_reconciliation_date ON tank_reconciliation_records(reading_date);
CREATE INDEX IF NOT EXISTS idx_tank_reconciliation_tank ON tank_reconciliation_records(tank_id);
