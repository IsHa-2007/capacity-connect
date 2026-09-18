-- ===========================================================================
-- CAPACITY CONNECT — INITIAL SCHEMA VERIFICATION (MODULE 5)
-- ===========================================================================
-- Purpose: Read-only checks proving 20260916161500_initial_schema.sql was
-- applied correctly to the REAL Supabase database.
--
-- This file lives in supabase/verify/ (NOT migrations/) so the Supabase CLI
-- never treats it as an applyable migration. Run it with psql / the SQL editor
-- connected to the project database after applying the migration.
--
-- Expected result summary:
--   * 01_object_inventory  -> 15 rows (12 tables + _migration_log +
--                             station_region_map already counted + view)
--   * 02_auth_relationship -> 1 row
--   * 03_fk_inventory      -> FK rows as designed (13 checked columns)
--   * 04_index_inventory   -> index count
--   * 05_trigger_inventory -> 7 triggers
--   * 06_rls_inventory     -> RLS enabled with policy list
--   * 07_seed_verification -> 12 rows
-- All checks are grouped; scroll/read only the sections that matter.
-- ===========================================================================

-- 01. Object inventory: every table and the view must exist.
SELECT
    n.nspname                                  AS schema_name,
    c.relkind::text                            AS kind,
    c.relname                                  AS name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v', 'm', 'p')
  AND c.relname IN (
        'station_region_map', 'users', 'user_certifications', 'courses',
        'course_sections', 'questions', 'enrollments', 'assessment_attempts',
        'certificates', 'broadcasts', 'notifications', 'competency_records',
        '_migration_log', 'course_stats'
      )
ORDER BY c.relname;

-- 02. Auth identity relationship: public.users.id must reference auth.users.id.
SELECT
    tc.constraint_name,
    tc.table_name          AS referencing_table,
    kcu.column_name        AS referencing_column,
    ccu.table_schema       AS referenced_schema,
    ccu.table_name         AS referenced_table,
    ccu.column_name        AS referenced_column,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
   AND rc.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'users';

-- 03. FK inventory (all designed foreign keys on application tables).
SELECT
    conrelid::regclass                         AS referencing_table,
    a.attname                                  AS referencing_column,
    confrelid::regclass                        AS referenced_table,
    confdeltype                                AS delete_rule
FROM pg_constraint c
JOIN LATERAL UNNEST(c.conkey) WITH ORDINALITY k(attnum, ord) ON TRUE
JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND conrelid::regclass::text LIKE 'public.%'
  AND confrelid::regclass::text LIKE 'public.%'
ORDER BY referencing_table, referencing_column;

-- 04. Index inventory (user-created indexes only; excludes PK/unique/RLS).
SELECT
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT IN (
        'station_region_map_pkey', 'users_pkey', 'users_email_key',
        'users_firebase_uid_key', 'user_certifications_pkey',
        'courses_pkey', 'courses_legacy_id_key', 'course_sections_pkey',
        'questions_pkey', 'enrollments_pkey', 'enrollments_user_course_unique',
        'assessment_attempts_pkey', 'certificates_pkey',
        'certificates_enrollment_id_key', 'certificates_certificate_number_key',
        'broadcasts_pkey', 'broadcasts_legacy_id_key', 'notifications_pkey',
        'competency_records_pkey', '_migration_log_pkey'
      )
ORDER BY tablename, indexname;

-- 05. Trigger inventory (user objects with our names).
SELECT
    event_object_table                AS table_name,
    trigger_name,
    event_manipulation                AS event,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
        'trg_users_set_updated_at', 'trg_courses_set_updated_at',
        'trg_enrollments_set_updated_at', 'trg_users_compute_region',
        'trg_users_compute_profile_completion', 'trg_users_update_search_vector',
        'trg_courses_update_search_vector'
      )
ORDER BY trigger_name;

-- 06. RLS: enabled on all 13 tables + the policy inventory.
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    count(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relname IN (
        'station_region_map', 'users', 'user_certifications', 'courses',
        'course_sections', 'questions', 'enrollments', 'assessment_attempts',
        'certificates', 'broadcasts', 'notifications', 'competency_records',
        '_migration_log'
      )
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

SELECT
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 07. Seed data: the 12 verified station -> region mappings.
SELECT
    station,
    region
FROM public.station_region_map
ORDER BY region, station;