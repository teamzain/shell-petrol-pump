-- Migration: Add multi-tank support to dispensers
-- Run this in your Supabase SQL Editor

-- Add tank_ids array column to store multiple linked tanks
ALTER TABLE dispensers
  ADD COLUMN IF NOT EXISTS tank_ids uuid[] DEFAULT '{}';

-- Backfill: copy existing single tank_id into the new array
UPDATE dispensers
  SET tank_ids = ARRAY[tank_id]
  WHERE tank_id IS NOT NULL AND (tank_ids IS NULL OR tank_ids = '{}');

-- Optionally keep tank_id as the primary/first tank for backward compatibility
-- (no need to drop tank_id - we keep it for backward compat with nozzles/readings)
