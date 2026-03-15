-- Create dip_charts table
CREATE TABLE IF NOT EXISTS dip_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create dip_chart_entries table
CREATE TABLE IF NOT EXISTS dip_chart_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dip_chart_id UUID REFERENCES dip_charts(id) ON DELETE CASCADE,
    dip_mm NUMERIC NOT NULL,
    volume_liters NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dip_chart_id, dip_mm)
);

-- Add dip_chart_id to tanks table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tanks' AND column_name = 'dip_chart_id'
    ) THEN
        ALTER TABLE tanks ADD COLUMN dip_chart_id UUID REFERENCES dip_charts(id) ON DELETE SET NULL;
    END IF;
END $$;
