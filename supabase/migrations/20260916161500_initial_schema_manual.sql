-- ===========================================================================
-- CAPACITY CONNECT — INITIAL SCHEMA (MODULE 5)
-- ===========================================================================
-- Purpose: Implement the FROZEN Module 2/3 PostgreSQL schema in Supabase.
--
-- Project boundary: CAPACITY CONNECT only.
--
-- This migration:
--   * Creates the 12 application tables + course_stats VIEW + _migration_log.
--   * Establishes RLS (enabled everywhere; restrictive baseline policies).
--   * Seeds ONLY the station -> region mappings verified from
--     src/services/userService.js (regionFor) and src/data/mockData.js
--     (regionalCompetency / stationRegionMap).
--
-- This migration does NOT:
--   * Migrate Firebase or Firestore data.
--   * Migrate Cloudinary files.
--   * Create a Storage bucket (storage provisioning is a later module).
--   * Insert application/users data (migration tooling runs later).
--   * Disable foreign keys, triggers, or constraints.
--
-- Convention notes (stored in DB, mapped by the API/backend later):
--   * users.role        : 'ADMIN' | 'TRAINER' | 'TRAINEE'
--   * approval_status   : 'PENDING' | 'APPROVED' | 'REJECTED'
--   * courses.status    : 'DRAFT' | 'PUBLISHED'
--     (legacy app "featured" maps to PUBLISHED + is_featured = TRUE; the
--      legacy lowercase values draft/published/featured are mapped by the
--      migration tooling, not stored here)
--   * courses.difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
--     (legacy title-case values, e.g. 'Beginner', mapped by the migration tool)
--   * course_sections.section_type: 'NOTES' | 'SLIDES' | 'VIDEOS' | 'PRACTICE'
--   * questions.difficulty: 'EASY' | 'MEDIUM' | 'HARD' (legacy lowercase mapped)
--   * questions.question_type: 'MCQ'
--   * enrollments.status: 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
--
-- AUTH IDENTITY MODEL (frozen):
--   public.users.id = auth.users.id (UUID, 1:1 FK)
--   public.users.firebase_uid = legacy Firebase UID (TEXT, NOT a UUID)
--   Firebase UID -> UUIDv5 mapping belongs to migration tooling, not runtime.
-- ===========================================================================

BEGIN;

-- gen_random_uuid() is core functionality since PostgreSQL 13 (Supabase is PG15+).
-- No extension is required.

-- ===========================================================================
-- 1. STATION REGION MAP (static verified reference data)
-- ===========================================================================
-- Sources: src/services/userService.js regionFor() and src/data/mockData.js
-- regionalCompetency. Only these 12 stations are verified; no others are added.

CREATE TABLE public.station_region_map (
    station TEXT PRIMARY KEY,
    region  TEXT NOT NULL
        CHECK (btrim(region) <> '')
);

-- ===========================================================================
-- 2. USERS (application profile table)
-- ===========================================================================
-- public.users.id MUST equal auth.users.id. Deleting the Supabase Auth identity
-- cascades to the profile, which then follows the row-deletion rules below.

CREATE TABLE public.users (
    id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    firebase_uid            TEXT UNIQUE,
    email                   TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    role                    TEXT NOT NULL DEFAULT 'TRAINEE'
        CHECK (role IN ('ADMIN', 'TRAINER', 'TRAINEE')),
    approval_status         TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    department              TEXT,
    emp_id                  TEXT,
    station                 TEXT,
    title                   TEXT,
    professional_summary    TEXT,
    years_of_experience     TEXT,
    expertise               TEXT[] NOT NULL DEFAULT '{}',
    specializations         TEXT[] NOT NULL DEFAULT '{}',
    skills                  TEXT[] NOT NULL DEFAULT '{}',
    qualifications          TEXT[] NOT NULL DEFAULT '{}',
    training_interests      TEXT[] NOT NULL DEFAULT '{}',
    achievements            TEXT[] NOT NULL DEFAULT '{}',
    profile_completion      SMALLINT
        CHECK (profile_completion IS NULL OR (profile_completion BETWEEN 0 AND 100)),
    region                  TEXT,
    profile_photo_bucket    TEXT,
    profile_photo_path      TEXT,
    profile_photo_mime      TEXT,
    profile_photo_size      BIGINT,
    profile_photo_filename  TEXT,
    legacy_profile_photo_id TEXT,
    search_vector           TSVECTOR,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- profile_completion: derived value. It is computed by the compute_profile_completion
-- trigger ONLY when the value is NULL (see section 8), so explicitly supplied
-- historical/imported values are preserved and never blindly overwritten.
-- region: derived from station via station_region_map by compute_user_region
-- trigger ONLY when NEW.region IS NULL, preserving explicit source values.

-- ===========================================================================
-- 3. USER CERTIFICATIONS
-- ===========================================================================
-- Storage metadata columns replace canonical public/Cloudinary file URLs;
-- the later storage module generates signed URLs on demand.

CREATE TABLE public.user_certifications (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    legacy_id              TEXT,
    certification_name     TEXT,
    issuer                 TEXT,
    obtained_date          DATE,
    expiry_date            DATE,
    credential_id          TEXT,
    credential_url         TEXT,
    storage_bucket         TEXT,
    storage_path           TEXT,
    mime_type              TEXT,
    file_size              BIGINT,
    original_filename      TEXT,
    legacy_storage_path    TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 4. COURSES
-- ===========================================================================
-- No stale enrolled/completion/rating counters: statistics come from course_stats.

CREATE TABLE public.courses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id          TEXT UNIQUE,
    trainer_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    legacy_trainer_id  TEXT,
    title              TEXT NOT NULL,
    domain             TEXT,
    description        TEXT,
    difficulty         TEXT
        CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    duration           TEXT,
    objectives         TEXT[] NOT NULL DEFAULT '{}',
    syllabus           TEXT[] NOT NULL DEFAULT '{}',
    tags               TEXT[] NOT NULL DEFAULT '{}',
    status             TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PUBLISHED')),
    is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
    search_vector      TSVECTOR,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at       TIMESTAMPTZ
);

-- ===========================================================================
-- 5. COURSE SECTIONS
-- ===========================================================================
-- Stored file references use storage_bucket + storage_path + metadata, never a
-- canonical file_url column covering all content types.

CREATE TABLE public.course_sections (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id            UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    section_type         TEXT NOT NULL
        CHECK (section_type IN ('NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE')),
    order_index          INTEGER NOT NULL DEFAULT 0,
    title                TEXT,
    storage_bucket       TEXT,
    storage_path         TEXT,
    mime_type            TEXT,
    file_size            BIGINT,
    original_filename    TEXT,
    legacy_storage_path  TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 6. QUESTIONS
-- ===========================================================================
-- A question is valid only when its structure is valid; is_valid is computed by
-- the application/migration. The "minimum 5 valid questions to publish" rule is
-- application/business logic (backend course service), not a column constraint.

CREATE TABLE public.questions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    difficulty          TEXT NOT NULL DEFAULT 'EASY'
        CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    text                TEXT NOT NULL,
    topic               TEXT,
    options             JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(options) = 'array'),
    correct_option_index INTEGER,
    tag_label           TEXT,
    question_type       TEXT NOT NULL DEFAULT 'MCQ'
        CHECK (question_type = 'MCQ'),
    is_valid            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        correct_option_index IS NULL OR correct_option_index >= 0
    )
);

-- ===========================================================================
-- 7. ENROLLMENTS
-- ===========================================================================
-- One enrollment per (trainee, course): UNIQUE(user_id, course_id).
-- Derived/historical fields (traineeName, courseTitle, old stage flags) are not
-- stored — they are obtained via joins. No invented timestamps.

CREATE TABLE public.enrollments (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id                    UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    trainer_id                   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status                       TEXT NOT NULL DEFAULT 'ENROLLED'
        CHECK (status IN ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    progress                     NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (progress BETWEEN 0 AND 100),
    started_at                   TIMESTAMPTZ,
    completed_at                 TIMESTAMPTZ,
    assessment_attempts_count    INTEGER NOT NULL DEFAULT 0
        CHECK (assessment_attempts_count >= 0),
    assessment_score             NUMERIC(6, 2),
    assessment_percentage        NUMERIC(5, 2)
        CHECK (assessment_percentage IS NULL OR assessment_percentage BETWEEN 0 AND 100),
    assessment_passed            BOOLEAN,
    feedback_content_depth       NUMERIC(3, 1)
        CHECK (feedback_content_depth IS NULL OR feedback_content_depth BETWEEN 1 AND 5),
    feedback_trainer_delivery    NUMERIC(3, 1)
        CHECK (feedback_trainer_delivery IS NULL OR feedback_trainer_delivery BETWEEN 1 AND 5),
    feedback_operational_relevance NUMERIC(3, 1)
        CHECK (feedback_operational_relevance IS NULL OR feedback_operational_relevance BETWEEN 1 AND 5),
    feedback_suggestions         TEXT,
    feedback_submitted_at        TIMESTAMPTZ,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT enrollments_user_course_unique UNIQUE (user_id, course_id)
);

-- ===========================================================================
-- 8. ASSESSMENT ATTEMPTS
-- ===========================================================================
-- NULL questions_snapshot / answers = unknown/unavailable in the legacy source;
-- [] = known empty. Never invent historical snapshots.

CREATE TABLE public.assessment_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id       UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    questions_snapshot  JSONB,
    answers             JSONB,
    correct_count       INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    incorrect_count     INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
    unattempted_count   INTEGER NOT NULL DEFAULT 0 CHECK (unattempted_count >= 0),
    raw_score           NUMERIC(6, 2),
    percentage          NUMERIC(5, 2)
        CHECK (percentage IS NULL OR percentage BETWEEN 0 AND 100),
    passed              BOOLEAN,
    time_spent_seconds  INTEGER CHECK (time_spent_seconds IS NULL OR time_spent_seconds >= 0),
    attempted_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 9. CERTIFICATES
-- ===========================================================================
-- NO circular dependency: certificates.enrollment_id -> enrollments.id ONLY
-- (UNIQUE). enrollments.certificate_id is intentionally NOT created.
-- certificate_number is UNIQUE and NOT NULL; historical numbers are preserved
-- verbatim (never renumbered). Future numbering (CC-YYYY-NNNNNN) is deferred to
-- the certificate service using a concurrency-safe mechanism, never COUNT(*).

CREATE TABLE public.certificates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id         UUID NOT NULL UNIQUE REFERENCES public.enrollments(id) ON DELETE RESTRICT,
    user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    course_id             UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    certificate_number    TEXT NOT NULL UNIQUE,
    legacy_certificate_id TEXT,
    issued_on             TIMESTAMPTZ NOT NULL,
    issued_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 10. BROADCASTS
-- ===========================================================================
-- Source-specific fields without canonical columns (type, region, station,
-- published flag, audienceLabel, cta, ...) are preserved in legacy_raw.

CREATE TABLE public.broadcasts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_id   TEXT UNIQUE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    audience    TEXT[] NOT NULL DEFAULT '{}',
    course_id   UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    legacy_raw  JSONB
);

-- ===========================================================================
-- 11. NOTIFICATIONS
-- ===========================================================================
-- is_migration_generated = TRUE marks notifications produced by migration
-- tooling (they are not historical persisted notifications).

CREATE TABLE public.notifications (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    broadcast_id               UUID REFERENCES public.broadcasts(id) ON DELETE SET NULL,
    title                      TEXT NOT NULL,
    body                       TEXT NOT NULL,
    is_read                    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_migration_generated     BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_source_broadcast_id TEXT
);

-- ===========================================================================
-- 12. COMPETENCY RECORDS
-- ===========================================================================
-- competency_level is derived by the application's established business rules;
-- recorded_at stays NULL when the source has no timestamp. traineeName is not
-- stored (derivable through users).

CREATE TABLE public.competency_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id        UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    station          TEXT,
    domain           TEXT,
    competency       NUMERIC(5, 2)
        CHECK (competency IS NULL OR competency BETWEEN 0 AND 100),
    competency_level TEXT,
    recorded_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 13. MIGRATION LOG (TEMPORARY MIGRATION INFRASTRUCTURE)
-- ===========================================================================
-- Used ONLY by future one-time migration tooling to track entity mapping.
-- It is NOT part of the application domain: no application code may depend on
-- it, and it will be DROPPED in the production cutover migration.

CREATE TABLE public._migration_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   TEXT NOT NULL,
    legacy_id     TEXT,
    target_id     UUID,
    status        TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 14. INDEXES
-- ===========================================================================
-- PK and UNIQUE constraints above already create indexes for:
--   users(id, email, firebase_uid), courses(id, legacy_id),
--   enrollments UNIQUE(user_id, course_id), certificates(enrollment_id,
--   certificate_number), broadcasts(legacy_id), station_region_map(station).
-- The indexes below cover the expected application queries without duplication.

CREATE INDEX idx_users_role              ON public.users (role);
CREATE INDEX idx_users_approval_status   ON public.users (approval_status);
CREATE INDEX idx_users_station           ON public.users (station);
CREATE INDEX idx_users_region            ON public.users (region);
CREATE INDEX idx_users_search_vector     ON public.users USING GIN (search_vector);

CREATE INDEX idx_courses_trainer_id      ON public.courses (trainer_id);
CREATE INDEX idx_courses_status          ON public.courses (status);
CREATE INDEX idx_courses_domain          ON public.courses (domain);
CREATE INDEX idx_courses_search_vector   ON public.courses USING GIN (search_vector);

CREATE INDEX idx_course_sections_course_id  ON public.course_sections (course_id);
CREATE INDEX idx_course_sections_type       ON public.course_sections (section_type);
CREATE INDEX idx_course_sections_course_order ON public.course_sections (course_id, order_index);

CREATE INDEX idx_questions_course_id        ON public.questions (course_id);
CREATE INDEX idx_questions_difficulty       ON public.questions (difficulty);
CREATE INDEX idx_questions_course_difficulty ON public.questions (course_id, difficulty);
CREATE INDEX idx_questions_course_valid     ON public.questions (course_id) WHERE is_valid;

CREATE INDEX idx_enrollments_user_id     ON public.enrollments (user_id);
CREATE INDEX idx_enrollments_course_id   ON public.enrollments (course_id);
CREATE INDEX idx_enrollments_trainer_id  ON public.enrollments (trainer_id);
CREATE INDEX idx_enrollments_status      ON public.enrollments (status);

CREATE INDEX idx_assessment_attempts_enrollment_id ON public.assessment_attempts (enrollment_id);
CREATE INDEX idx_assessment_attempts_user_id        ON public.assessment_attempts (user_id);
CREATE INDEX idx_assessment_attempts_course_id      ON public.assessment_attempts (course_id);
CREATE INDEX idx_assessment_attempts_attempted_at   ON public.assessment_attempts (attempted_at);

CREATE INDEX idx_certificates_user_id    ON public.certificates (user_id);
CREATE INDEX idx_certificates_course_id  ON public.certificates (course_id);

CREATE INDEX idx_broadcasts_created_by   ON public.broadcasts (created_by);
CREATE INDEX idx_broadcasts_course_id    ON public.broadcasts (course_id);
CREATE INDEX idx_broadcasts_created_at   ON public.broadcasts (created_at);

CREATE INDEX idx_notifications_user_id   ON public.notifications (user_id);
CREATE INDEX idx_notifications_is_read   ON public.notifications (is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications (created_at);
CREATE INDEX idx_notifications_broadcast_id ON public.notifications (broadcast_id);

CREATE INDEX idx_competency_records_user_id   ON public.competency_records (user_id);
CREATE INDEX idx_competency_records_course_id ON public.competency_records (course_id);
CREATE INDEX idx_competency_records_station   ON public.competency_records (station);
CREATE INDEX idx_competency_records_domain    ON public.competency_records (domain);

CREATE INDEX idx_migration_log_lookup    ON public._migration_log (entity_type, legacy_id);

-- ===========================================================================
-- 15. TRIGGERS
-- ===========================================================================

-- 15a. updated_at maintenance (runtime updates only; INSERTs are untouched so
-- historical timestamps can always be supplied by the migration).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_courses_set_updated_at
    BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_enrollments_set_updated_at
    BEFORE UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 15b. Region derivation: users.station -> station_region_map -> users.region.
-- Fires only when NEW.region IS NULL, so explicit source-derived region values
-- provided during migration are preserved. No session_replication_role tricks.

CREATE OR REPLACE FUNCTION public.compute_user_region()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.region IS NULL AND NEW.station IS NOT NULL THEN
        SELECT m.region INTO NEW.region
        FROM public.station_region_map m
        WHERE m.station = NEW.station;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_compute_region
    BEFORE INSERT OR UPDATE OF station ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.compute_user_region();

-- 15c. Profile completion derivation.
-- Formula (established): min(100, round(scored / 13 * 100)) where scored =
--   5 identity scalars (name, title, station, region, professional_summary) +
--   spread of the 4 professional sources (skills, expertise, qualifications)
--   and the count of user_certifications rows.
-- Fires ONLY when NEW.profile_completion IS NULL, so imported historical values
-- are preserved. The backend remains the authoritative calculator on profile
-- updates; this trigger only bootstraps rows where no value was supplied.

CREATE OR REPLACE FUNCTION public.compute_profile_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.profile_completion IS NULL THEN
        NEW.profile_completion := LEAST(100, ROUND(
            (
                (CASE WHEN btrim(coalesce(NEW.name, '')) <> '' THEN 1 ELSE 0 END)
                + (CASE WHEN btrim(coalesce(NEW.title, '')) <> '' THEN 1 ELSE 0 END)
                + (CASE WHEN btrim(coalesce(NEW.station, '')) <> '' THEN 1 ELSE 0 END)
                + (CASE WHEN btrim(coalesce(NEW.region, '')) <> '' THEN 1 ELSE 0 END)
                + (CASE WHEN btrim(coalesce(NEW.professional_summary, '')) <> '' THEN 1 ELSE 0 END)
                + (SELECT count(*) FROM public.user_certifications uc WHERE uc.user_id = NEW.id)
                + coalesce(array_length(NEW.skills, 1), 0)
                + coalesce(array_length(NEW.expertise, 1), 0)
                + coalesce(array_length(NEW.qualifications, 1), 0)
            )::numeric / 13 * 100
        ))::smallint;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_compute_profile_completion
    BEFORE INSERT OR UPDATE OF name, title, station, region, professional_summary, skills, expertise, qualifications
    ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.compute_profile_completion();

-- 15d. search_vector maintenance (trigger-based, NOT generated columns).
-- PostgreSQL rejects a generated column whose expression uses the built-in
-- array_to_string() with error 42P17 ("generation expression is not immutable")
-- because array_to_string(anyarray, text) is polymorphic and is therefore
-- marked STABLE, not IMMUTABLE. to_tsvector('english'::regconfig, ...) itself
-- is immutable, but the array serialization inside the expression is not.
-- A BEFORE trigger is exempt from the generated-column immutability check, so
-- search_vector is recomputed on every INSERT/UPDATE from the row's own values,
-- exactly like an expression column would have been. No built-in function is
-- (re)marked or wrapped as IMMUTABLE here.

CREATE OR REPLACE FUNCTION public.update_user_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english'::regconfig,
        coalesce(NEW.name, '') || ' ' ||
        coalesce(NEW.title, '') || ' ' ||
        coalesce(NEW.professional_summary, '') || ' ' ||
        coalesce(NEW.department, '') || ' ' ||
        coalesce(NEW.station, '') || ' ' ||
        coalesce(NEW.region, '') || ' ' ||
        coalesce(NEW.emp_id, '') || ' ' ||
        array_to_string(NEW.expertise, ' ') || ' ' ||
        array_to_string(NEW.specializations, ' ') || ' ' ||
        array_to_string(NEW.skills, ' ') || ' ' ||
        array_to_string(NEW.qualifications, ' ') || ' ' ||
        array_to_string(NEW.achievements, ' ') || ' ' ||
        array_to_string(NEW.training_interests, ' ')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_course_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english'::regconfig,
        coalesce(NEW.title, '') || ' ' ||
        coalesce(NEW.description, '') || ' ' ||
        coalesce(NEW.domain, '') || ' ' ||
        array_to_string(NEW.tags, ' ')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_update_search_vector
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_user_search_vector();

CREATE TRIGGER trg_courses_update_search_vector
    BEFORE INSERT OR UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION public.update_course_search_vector();

-- ===========================================================================
-- 16. COURSE STATS VIEW
-- ===========================================================================
-- Aggregates each source independently (one row per course per CTE) and joins
-- the aggregated CTEs on course_id. This NEVER multiplies rows: a course with
-- 10 enrollments and 20 questions still yields exactly one row (not 200).

CREATE VIEW public.course_stats AS
WITH enroll_agg AS (
    SELECT
        course_id,
        count(*)                                   AS enrollment_count,
        count(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
        round(avg(assessment_percentage) FILTER (WHERE assessment_percentage IS NOT NULL), 2)
                                                   AS avg_assessment_percentage,
        count(*) FILTER (WHERE assessment_passed) AS passed_assessment_count,
        round(avg(feedback_content_depth) FILTER (WHERE feedback_content_depth IS NOT NULL), 2)
                                                   AS avg_feedback_content_depth,
        round(avg(feedback_trainer_delivery) FILTER (WHERE feedback_trainer_delivery IS NOT NULL), 2)
                                                   AS avg_feedback_trainer_delivery,
        round(avg(feedback_operational_relevance) FILTER (WHERE feedback_operational_relevance IS NOT NULL), 2)
                                                   AS avg_feedback_operational_relevance
    FROM public.enrollments
    GROUP BY course_id
),
question_agg AS (
    SELECT
        course_id,
        count(*)                                    AS question_count,
        count(*) FILTER (WHERE is_valid)            AS valid_question_count
    FROM public.questions
    GROUP BY course_id
),
section_agg AS (
    SELECT
        course_id,
        count(*) FILTER (WHERE section_type = 'NOTES')    AS notes_count,
        count(*) FILTER (WHERE section_type = 'SLIDES')   AS slides_count,
        count(*) FILTER (WHERE section_type = 'VIDEOS')   AS videos_count,
        count(*) FILTER (WHERE section_type = 'PRACTICE') AS practice_count
    FROM public.course_sections
    GROUP BY course_id
)
SELECT
    c.id                                                  AS course_id,
    coalesce(e.enrollment_count, 0)                       AS enrollment_count,
    coalesce(e.completed_count, 0)                        AS completed_count,
    e.avg_assessment_percentage,
    coalesce(e.passed_assessment_count, 0)                AS passed_assessment_count,
    e.avg_feedback_content_depth,
    e.avg_feedback_trainer_delivery,
    e.avg_feedback_operational_relevance,
    coalesce(q.question_count, 0)                         AS question_count,
    coalesce(q.valid_question_count, 0)                   AS valid_question_count,
    coalesce(s.notes_count, 0)                            AS notes_count,
    coalesce(s.slides_count, 0)                           AS slides_count,
    coalesce(s.videos_count, 0)                           AS videos_count,
    coalesce(s.practice_count, 0)                         AS practice_count
FROM public.courses c
LEFT JOIN enroll_agg e ON e.course_id = c.id
LEFT JOIN question_agg q ON q.course_id = c.id
LEFT JOIN section_agg s ON s.course_id = c.id;

-- ===========================================================================
-- 17. ROW LEVEL SECURITY
-- ===========================================================================
-- Strategy: RLS is enabled on every application table. The backend uses the
-- service-role client for privileged operations, which BYPASSES RLS, so RLS is
-- NOT the backend's protection — server-side authentication/authorization is.
-- These policies are a restrictive baseline that only prevents accidental
-- direct exposure if a valid user token ever reaches PostgREST directly:
-- ownership-scoped reads (auth.uid()) where clearly safe, deny-everything
-- elsewhere (no anonymous/broad access, no writes from the client).

ALTER TABLE public.station_region_map   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_certifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._migration_log       ENABLE ROW LEVEL SECURITY;

-- Self-service read policies (owner-scoped, auth.uid() = owning user id).
CREATE POLICY users_select_own ON public.users
    FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY user_certifications_select_own ON public.user_certifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY enrollments_select_own ON public.enrollments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY assessment_attempts_select_own ON public.assessment_attempts
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY certificates_select_own ON public.certificates
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY competency_records_select_own ON public.competency_records
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Nothing else: self-service UPDATE (e.g. marking a notification read) only.
-- No INSERT/DELETE policies anywhere and no write policy on users: profile
-- writes go exclusively through the backend (service-role), preventing both
-- self role/approval escalation and arbitrary public writes.
CREATE POLICY notifications_update_own ON public.notifications
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ===========================================================================
-- 18. REFERENCE DATA SEED — station_region_map (verified sources only)
-- ===========================================================================
INSERT INTO public.station_region_map (station, region) VALUES
    ('New Delhi',            'North'),
    ('Jaipur',               'North'),
    ('Mumbai',               'West'),
    ('Ahmedabad',            'West'),
    ('Pune',                 'West'),
    ('Kolkata',              'East'),
    ('Guwahati',             'East'),
    ('Bhubaneswar',          'East'),
    ('Chennai',              'South'),
    ('Bengaluru',            'South'),
    ('Hyderabad',            'South'),
    ('Thiruvananthapuram',   'South')
ON CONFLICT (station) DO NOTHING;

COMMIT;
-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================