-- Migration: Add explicit tank_id to nozzles table
-- Run this in your Supabase SQL Editor

ALTER TABLE public.nozzles 
  ADD COLUMN IF NOT EXISTS tank_id UUID REFERENCES public.tanks(id);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
