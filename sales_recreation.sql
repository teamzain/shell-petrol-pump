-- Migration: Setup Nozzle Management and Automated Sales Recording
-- Based on Module 8 & 9 Requirements

-- 1. Nozzles Configuration Table
CREATE TABLE IF NOT EXISTS public.nozzles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nozzle_number TEXT NOT NULL UNIQUE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'under_maintenance')),
    initial_reading NUMERIC(15, 2) NOT NULL DEFAULT 0,
    last_reading NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Nozzle Readings Table
CREATE TABLE IF NOT EXISTS public.nozzle_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nozzle_id UUID REFERENCES public.nozzles(id) ON DELETE CASCADE,
    reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reading_time TIME NOT NULL DEFAULT CURRENT_TIME,
    reading_type TEXT NOT NULL CHECK (reading_type IN ('opening', 'closing')),
    meter_reading NUMERIC(15, 2) NOT NULL,
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(nozzle_id, reading_date, reading_type)
);

-- 3. Daily Sales (Automated from Readings)
CREATE TABLE IF NOT EXISTS public.daily_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nozzle_id UUID REFERENCES public.nozzles(id),
    sale_date DATE NOT NULL,
    quantity NUMERIC(15, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    revenue NUMERIC(15, 2) NOT NULL,
    cogs NUMERIC(15, 2) NOT NULL,
    gross_profit NUMERIC(15, 2) NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    is_overnight BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Manual Sales (Lubricants/Oils)
CREATE TABLE IF NOT EXISTS public.manual_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    product_id UUID REFERENCES public.products(id),
    quantity NUMERIC(12, 2) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL,
    payment_method TEXT NOT NULL,
    customer_name TEXT,
    profit NUMERIC(15, 2) NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id)
);

-- 5. Daily Operations Tracking (Re-creation)
CREATE TABLE IF NOT EXISTS public.daily_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_date DATE NOT NULL UNIQUE,
    open_time TIMESTAMP WITH TIME ZONE,
    close_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opening_cash NUMERIC(15, 2) DEFAULT 0,
    closing_cash NUMERIC(15, 2),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.nozzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nozzle_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_operations ENABLE ROW LEVEL SECURITY;

-- Simple Policies
DROP POLICY IF EXISTS "Allow authenticated full access to nozzles" ON public.nozzles;
CREATE POLICY "Allow authenticated full access to nozzles" ON public.nozzles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to nozzle_readings" ON public.nozzle_readings;
CREATE POLICY "Allow authenticated full access to nozzle_readings" ON public.nozzle_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to daily_sales" ON public.daily_sales;
CREATE POLICY "Allow authenticated full access to daily_sales" ON public.daily_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to manual_sales" ON public.manual_sales;
CREATE POLICY "Allow authenticated full access to manual_sales" ON public.manual_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated full access to daily_operations" ON public.daily_operations;
CREATE POLICY "Allow authenticated full access to daily_operations" ON public.daily_operations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nozzle_readings_date ON public.nozzle_readings(reading_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON public.daily_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_manual_sales_date ON public.manual_sales(sale_date);
