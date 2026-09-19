-- ===========================================================================
-- CAPACITY CONNECT — MODULE 17B DUTY ASSIGNMENT VERIFICATION (READ-ONLY)
-- ===========================================================================
-- Run with psql / the Supabase SQL editor AFTER applying
-- 20260919120000_duty_assignments.sql. Proves the additive objects exist.
-- This file lives in supabase/verify/ so the Supabase CLI never applies it.
-- ===========================================================================

-- 01. Table + column inventory
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'duty_assignments'
ORDER BY ordinal_position;

-- 02. Constraints
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.duty_assignments'::regclass
ORDER BY conname;

-- 03. Foreign keys (must target public.users(id))
SELECT
    con.conname,
    att.attname       AS column_name,
    cl.relname        AS references_table,
    fatt.attname      AS references_column
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.confrelid
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = ANY (con.confkey)
WHERE con.conrelid = 'public.duty_assignments'::regclass
  AND con.contype = 'f'
ORDER BY con.conname;

-- 04. Indexes (including the partial active-assignment unique index)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'duty_assignments'
ORDER BY indexname;

-- 05. Triggers
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.duty_assignments'::regclass
  AND NOT tgisinternal
ORDER BY tgname;

-- 06. RLS status + policies
SELECT c.relname, c.relrowsecurity AS rls_enabled, p.polname, p.polcmd
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = 'duty_assignments';

-- 07. RPC signature + EXECUTE grants (service_role only)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('dispatch_duty_assignments', 'enforce_duty_assignment_transition')
ORDER BY p.proname;
