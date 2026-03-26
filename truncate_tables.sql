-- ==========================================
-- SQL Script to truncate all tables in public schema except 'profiles' and 'users'
-- WARNING: This operation is DESTRUCTIVE.
-- ==========================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- Disable triggers/constraints for efficiency (RESTART IDENTITY CASCADE handles most)
    -- We exclude 'profiles' and 'users' which are typically the auth/app user tables.
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN ('profiles', 'users', 'user')
    ) LOOP
        RAISE NOTICE 'Truncating table: %', r.tablename;
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
    END LOOP;
END $$;
