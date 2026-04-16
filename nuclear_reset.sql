-- ==========================================
-- NUCLEAR RESET: Truncate ALL Business Data
-- PRESERVED: 'profiles' (User account info)
-- ==========================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- This loop finds every table in the 'public' schema
    -- It excludes 'profiles' and common auth/meta tables to keep the system running
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN ('profiles', 'users', 'user', '_prisma_migrations', 'schema_migrations')
    ) LOOP
        -- RESTART IDENTITY: Resets ID counters back to 1
        -- CASCADE: Automatically clears related rows in other tables (Foreign Keys)
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP;
END $$;

-- Optional: Re-notify PostgREST to refresh its cache
NOTIFY pgrst, 'reload schema';
