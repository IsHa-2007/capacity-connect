-- ===========================================================================
-- CAPACITY CONNECT — MODULE 17B: DUTY ASSIGNMENT PERSISTENCE
-- ===========================================================================
-- Additive, approved schema extension that makes the Regional Officer Dispatch
-- workflow persistent. It introduces exactly ONE new application table plus the
-- supporting indexes, constraints and one atomic write RPC. No existing table,
-- column, view, policy or trigger is modified.
--
-- Identity model: public.users.id is the canonical application identity (it
-- references auth.users(id) ON DELETE CASCADE). Every duty-assignment offender/
-- author reference therefore targets public.users(id), matching the convention
-- already used by public.certificates (user_id / issued_by) and
-- public.notifications (user_id).
--
-- RLS: enabled with a single owner-scoped SELECT policy (the officer may read
-- their own assignments). There are intentionally NO write policies; the Node
-- backend uses the service-role client (which bypasses RLS) for all mutations,
-- exactly as the rest of the application does. Direct PostgREST writes by an
-- `authenticated` role are therefore impossible.
--
-- Applied manually (Supabase SQL editor / psql) per the project convention.
-- Deterministic and re-runnable (all objects use IF NOT EXISTS / CREATE OR
-- REPLACE), and fully reversible — see the ROLLBACK block at the end.

BEGIN;

-- ===========================================================================
-- 1. DUTY ASSIGNMENTS
-- ===========================================================================
-- One row = one officer dispatched to a regional capability duty.
-- status is a controlled set (no free-form strings). completed_at is only
-- meaningful for a COMPLETED row and is stamped by the transition trigger.

CREATE TABLE IF NOT EXISTS public.duty_assignments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    officer_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    region       TEXT NOT NULL CHECK (btrim(region) <> ''),
    station      TEXT,
    capability   TEXT NOT NULL CHECK (btrim(capability) <> ''),
    status       TEXT NOT NULL DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    assigned_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Completion bookkeeping must stay internally consistent.
    CONSTRAINT duty_assignments_completed_at_state
        CHECK (
            (status = 'COMPLETED' AND completed_at IS NOT NULL)
            OR (status <> 'COMPLETED' AND completed_at IS NULL)
        ),
    CONSTRAINT duty_assignments_completed_at_order
        CHECK (completed_at IS NULL OR completed_at >= assigned_at)
);

-- ===========================================================================
-- 2. INDEXES (application query paths only — no speculative indexes)
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_duty_assignments_officer_id  ON public.duty_assignments (officer_id);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_region      ON public.duty_assignments (region);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_capability  ON public.duty_assignments (capability);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_status      ON public.duty_assignments (status);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_assigned_by ON public.duty_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_assigned_at ON public.duty_assignments (assigned_at);

-- Duplicate prevention: an officer may hold at most ONE active assignment per
-- region + capability. Historical COMPLETED/CANCELLED rows are NOT constrained,
-- so an officer can legitimately be re-dispatched over time. This is a partial
-- unique index (not a UNIQUE constraint) precisely to preserve history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_duty_assignments_active
    ON public.duty_assignments (officer_id, region, capability)
    WHERE status IN ('ASSIGNED', 'IN_PROGRESS');

-- ===========================================================================
-- 3. TRIGGERS
-- ===========================================================================
-- 3a. updated_at maintenance — reuses the existing canonical function.
DROP TRIGGER IF EXISTS set_duty_assignments_updated_at ON public.duty_assignments;
CREATE TRIGGER set_duty_assignments_updated_at
    BEFORE UPDATE ON public.duty_assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3b. Status state machine (enforced at the database layer too, so a direct
-- service-role UPDATE cannot record a nonsensical transition). Allowed:
--   ASSIGNED    -> IN_PROGRESS | CANCELLED
--   IN_PROGRESS -> COMPLETED   | CANCELLED
--   COMPLETED   -> (terminal)
--   CANCELLED   -> (terminal)
-- Reaching COMPLETED stamps completed_at when the caller did not.
CREATE OR REPLACE FUNCTION public.enforce_duty_assignment_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            (OLD.status = 'ASSIGNED'    AND NEW.status IN ('IN_PROGRESS', 'CANCELLED')) OR
            (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED', 'CANCELLED'))
        ) THEN
            RAISE EXCEPTION 'invalid duty assignment transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status = 'COMPLETED' AND NEW.completed_at IS NULL THEN
        NEW.completed_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_duty_assignment_transition ON public.duty_assignments;
CREATE TRIGGER enforce_duty_assignment_transition
    BEFORE UPDATE ON public.duty_assignments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_duty_assignment_transition();

-- ===========================================================================
-- 4. ROW LEVEL SECURITY
-- ===========================================================================
ALTER TABLE public.duty_assignments ENABLE ROW LEVEL SECURITY;

-- Officers may read only their own assignments. Admins and all mutations go
-- through the service-role backend (which bypasses RLS); no client write policy
-- exists, so a leaked user token cannot create/alter assignments directly.
DROP POLICY IF EXISTS duty_assignments_select_own ON public.duty_assignments;
CREATE POLICY duty_assignments_select_own ON public.duty_assignments
    FOR SELECT TO authenticated USING (auth.uid() = officer_id);

-- ===========================================================================
-- 5. ATOMIC DISPATCH RPC
-- ===========================================================================
-- Creates every selected assignment in ONE statement, hence one transaction:
-- if any row violates a constraint (notably the active-assignment unique index)
-- the whole statement fails and NO assignment is created. The backend never
-- fakes atomicity in JavaScript.
--
-- EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to
-- service_role, so the RPC cannot be called directly through PostgREST by a
-- signed-in user; RLS would deny the INSERT anyway, but this is defence in
-- depth.

CREATE OR REPLACE FUNCTION public.dispatch_duty_assignments(
    p_officer_ids UUID[],
    p_region      TEXT,
    p_station     TEXT,
    p_capability  TEXT,
    p_assigned_by UUID,
    p_notes       TEXT
)
RETURNS SETOF public.duty_assignments
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_officer_ids IS NULL OR array_length(p_officer_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'dispatch requires at least one officer' USING ERRCODE = 'check_violation';
    END IF;

    RETURN QUERY
    INSERT INTO public.duty_assignments (officer_id, region, station, capability, assigned_by, notes)
    SELECT officer_id, p_region, p_station, p_capability, p_assigned_by, p_notes
    FROM unnest(p_officer_ids) AS officer_id
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_duty_assignments(UUID[], TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_duty_assignments(UUID[], TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

-- The transition helper is invoked only by its trigger; it needs no external
-- EXECUTE grant.
REVOKE ALL ON FUNCTION public.enforce_duty_assignment_transition() FROM PUBLIC;

COMMIT;

-- ===========================================================================
-- ROLLBACK (manual; the project uses single UP migrations, no down scripts)
-- ===========================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.dispatch_duty_assignments(UUID[], TEXT, TEXT, TEXT, UUID, TEXT);
--   DROP TRIGGER IF EXISTS enforce_duty_assignment_transition ON public.duty_assignments;
--   DROP FUNCTION IF EXISTS public.enforce_duty_assignment_transition();
--   DROP TRIGGER IF EXISTS set_duty_assignments_updated_at ON public.duty_assignments;
--   DROP TABLE IF EXISTS public.duty_assignments;
-- COMMIT;
-- ===========================================================================
-- END OF MIGRATION
