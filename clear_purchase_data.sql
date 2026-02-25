-- WARNING: This script will remove ALL data from supplier and purchase related tables.
-- It cascades to also remove related transactions, deliveries, and holds.

TRUNCATE TABLE po_notifications CASCADE;
TRUNCATE TABLE po_hold_records CASCADE;
TRUNCATE TABLE company_account_transactions CASCADE;
TRUNCATE TABLE deliveries CASCADE;
TRUNCATE TABLE purchase_orders CASCADE;
TRUNCATE TABLE company_accounts CASCADE;
TRUNCATE TABLE suppliers CASCADE;
