-- Cleanup script to drop old product-related tables and rules
-- WARNING: This will delete all existing data in these tables

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_price_history_selling_price ON products;
DROP FUNCTION IF EXISTS handle_selling_price_change();

-- Drop tables
DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS products;

-- If there are any other related tables or rules found during investigation, 
-- they should be added here. Based on the previous session, these are the main ones.
