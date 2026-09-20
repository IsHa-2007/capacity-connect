-- ===========================================================================
-- CAPACITY CONNECT — MODULE 19 (PHASE 1): TRAINER-CONFIGURABLE ASSESSMENT DURATION
-- ===========================================================================
-- Smallest possible additive schema extension: ONE new column on public.courses
-- holding the course-specific assessment duration in whole minutes. No existing
-- table, column, view, policy or trigger is modified.
--
-- Semantics (authoritative source: server/src/services/assessment.service.js):
--   * The backend is authoritative for the duration: when an assessment attempt
--     starts it uses the owning course's assessment_duration_minutes (the
--     product default of 20 is applied when the column is NULL).
--   * The column is bounded in the schema (5..180 minutes) mirroring the zod
--     validator + assessment.service constants, so an out-of-range value can
--     never be persisted even if a direct service-role write bypasses the API.
--   * Existing courses default to 20 minutes: the NOT NULL DEFAULT 20 applies
--     the default to every pre-existing row at ALTER time.
--
-- Applied manually (Supabase SQL editor / psql) per the project convention.
-- Deterministic and re-runnable; fully reversible — see the ROLLBACK block.

BEGIN;

-- ===========================================================================
-- 1. COURSE ASSESSMENT DURATION (minutes)
-- ===========================================================================
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS assessment_duration_minutes INTEGER NOT NULL DEFAULT 20
        CHECK (assessment_duration_minutes BETWEEN 5 AND 180);

COMMENT ON COLUMN public.courses.assessment_duration_minutes IS
    'Course-specific assessment time limit in whole minutes (5..180, default 20). Used by the assessment service at attempt start.';

COMMIT;

-- ===========================================================================
-- ROLLBACK (manual; the project uses single UP migrations, no down scripts)
-- ===========================================================================
-- BEGIN;
--   ALTER TABLE public.courses DROP COLUMN IF EXISTS assessment_duration_minutes;
-- COMMIT;
-- ===========================================================================
-- END OF MIGRATION