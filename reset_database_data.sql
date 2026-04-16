-- =====================================================
-- DATABASE RESET SCRIPT
-- This will delete ALL data except for User Profiles.
-- RUN THIS IN: Supabase → SQL Editor
-- =====================================================

-- 1. Disable triggers temporarily (optional but safer for bulk truncate)
-- SET session_replication_role = 'replica';

TRUNCATE TABLE 
    -- Transaction & History Tables
    daily_sales,
    manual_sales,
    daily_expenses,
    stock_movements,
    stock_daily_register,
    purchase_orders,
    deliveries,
    po_hold_records,
    company_account_transactions,
    purchase_ledger,
    receivables_ledger,
    customer_receipts,
    bank_transactions,
    price_history,
    notifications,
    tank_reconciliation,
    dip_readings,
    card_sales,
    
    -- Setup & Configuration Tables (Wiping these will require re-setup)
    suppliers,
    products,
    tanks,
    nozzles,
    company_accounts,
    bank_accounts,
    customer_accounts
RESTART IDENTITY CASCADE;

-- 2. Optional: Reset any sequences if RESTART IDENTITY missed any (usually not needed with modern Postgres)

-- 3. Re-enable triggers
-- SET session_replication_role = 'origin';

-- VERIFICATION:
-- SELECT count(*) FROM user_profile; -- Should still have data
-- SELECT count(*) FROM daily_sales;  -- Should be 0
