-- ===========================================================================
-- CAPACITY CONNECT — MODULE 19 COURSE ASSESSMENT DURATION VERIFICATION (READ-ONLY)
-- ===========================================================================
-- Run with psql / the Supabase SQL editor AFTER applying
-- 20260920120000_course_assessment_duration.sql. Proves the additive column
-- exists with the bounded CHECK, its default, and that every pre-existing
-- course row was defaulted to 20 minutes. Lives in supabase/verify/ so the
-- Supabase CLI never applies it.
-- ===========================================================================

-- 01. Column inventory (must include assessment_duration_minutes)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'courses'
  AND column_name = 'assessment_duration_minutes';

-- 02. Bounds CHECK constraint + default (5..180, default 20)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.courses'::regclass
  AND conname = 'courses_assessment_duration_minutes_check';

-- 03. Existing courses defaulted to the 20-minute product default
SELECT
    count(*)                                            AS total_courses,
    count(*) FILTER (WHERE assessment_duration_minutes = 20) AS at_default_20,
    min(assessment_duration_minutes)                    AS min_minutes,
    max(assessment_duration_minutes)                    AS max_minutes
FROM public.courses;

-- 04. No out-of-range value can be present (CHECK sanity)
SELECT count(*) AS out_of_bounds_rows
FROM public.courses
WHERE assessment_duration_minutes < 5 OR assessment_duration_minutes > 180;