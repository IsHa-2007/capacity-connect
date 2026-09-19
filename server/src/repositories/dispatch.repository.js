// MODULE 17A/17B — REGIONAL OFFICER DISPATCH REPOSITORY
//
// Reads the FROZEN Module 5 schema for matching, and reads/writes the additive
// Module 17B `duty_assignments` table for persistence. Every value used for
// eligibility and scoring is a persisted row: approved user profiles, real
// trainee feedback on completed enrollments, and real course-authoring history.
// Signals that have no column in the schema (rating, availability) are
// intentionally absent here so the service can report them as unavailable
// instead of inventing them.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

const DUTY_ASSIGNMENT_COLUMNS =
  'id, officer_id, region, station, capability, status, assigned_by, assigned_at, completed_at, notes, created_at, updated_at'

function asDispatchError(operation, error) {
  return new ApiError(
    500,
    `DISPATCH_${operation.toUpperCase()}_UNEXPECTED`,
    'The regional officer data could not be loaded. Please try again.',
    { dbCode: error?.code, dbMessage: error?.message },
  )
}

// ---------------------------------------------------------------------------
// Matching inputs (frozen schema, read-only)
// ---------------------------------------------------------------------------

// Approved workforce profiles — the only candidates for a duty assignment.
export async function fetchApprovedOfficerProfiles() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, role, title, station, region, expertise, specializations, skills, years_of_experience')
    .eq('approval_status', 'APPROVED')
  if (error) throw asDispatchError('officers', error)
  return data || []
}

// Real trainee feedback per trainer, averaged across the three Module 5 feedback
// dimensions (each 1–5). Only completed enrollments carrying at least one
// feedback value contribute; a trainer with no feedback is simply absent from the
// map (never assumed to be neutral/4-of-5).
export async function fetchTrainerFeedbackAverages() {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('trainer_id, feedback_content_depth, feedback_trainer_delivery, feedback_operational_relevance')
    .eq('status', 'COMPLETED')
    .not('trainer_id', 'is', null)
  if (error) throw asDispatchError('feedback', error)

  const agg = new Map()
  for (const row of data || []) {
    const values = [
      row.feedback_content_depth,
      row.feedback_trainer_delivery,
      row.feedback_operational_relevance,
    ]
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0)
    if (!values.length) continue
    const entry = agg.get(row.trainer_id) || { sum: 0, count: 0 }
    entry.sum += values.reduce((s, v) => s + v, 0)
    entry.count += values.length
    agg.set(row.trainer_id, entry)
  }

  const averages = new Map()
  for (const [trainerId, entry] of agg) averages.set(trainerId, entry.sum / entry.count)
  return averages
}

// Real delivery history: how many distinct courses each trainer has authored.
export async function fetchTrainerDutyHistory() {
  const { data, error } = await supabaseAdmin.from('courses').select('trainer_id').not('trainer_id', 'is', null)
  if (error) throw asDispatchError('history', error)
  const counts = new Map()
  for (const row of data || []) {
    if (!row.trainer_id) continue
    counts.set(row.trainer_id, (counts.get(row.trainer_id) || 0) + 1)
  }
  return counts
}

// The configured regions (from station_region_map) — the only valid region keys.
export async function fetchRegionKeys() {
  const { data, error } = await supabaseAdmin.from('station_region_map').select('region')
  if (error) throw asDispatchError('regions', error)
  return Array.from(new Set((data || []).map((r) => r.region).filter(Boolean)))
}

// Verified station -> region mapping (never invent geography).
export async function fetchStationRegionMap() {
  const { data, error } = await supabaseAdmin.from('station_region_map').select('station, region')
  if (error) throw asDispatchError('stations', error)
  return data || []
}

// Lightweight identity summaries for roster enrichment (id -> name/station).
export async function fetchUserSummariesByIds(ids) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)))
  if (!unique.length) return []
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, station, role, region')
    .in('id', unique)
  if (error) throw asDispatchError('summaries', error)
  return data || []
}

// ---------------------------------------------------------------------------
// Duty assignment persistence (Module 17B)
// ---------------------------------------------------------------------------

// Atomic create: a single INSERT..SELECT statement inside a plpgsql function.
// If any selected officer already has an ACTIVE assignment for this region +
// capability, the partial unique index aborts the whole statement, so EITHER
// every assignment is created OR none is. No JavaScript-side fake atomicity.
export async function createDutyAssignments({ officerIds, region, station, capability, assignedBy, notes }) {
  const { data, error } = await supabaseAdmin.rpc('dispatch_duty_assignments', {
    p_officer_ids: officerIds,
    p_region: region,
    p_station: station ?? null,
    p_capability: capability,
    p_assigned_by: assignedBy,
    p_notes: notes ?? null,
  })
  if (error) {
    if (error.code === '23505') {
      throw new ApiError(
        409,
        'DUTY_ASSIGNMENT_CONFLICT',
        'One or more selected officers already have an active assignment for this region and capability.',
        { dbCode: error.code },
      )
    }
    throw asDispatchError('create', error)
  }
  return data || []
}

export async function listDutyAssignments({ officerId, region, capability, status, limit = 200 } = {}) {
  let builder = supabaseAdmin
    .from('duty_assignments')
    .select(DUTY_ASSIGNMENT_COLUMNS)
    .order('assigned_at', { ascending: false })
    .limit(Math.min(Number(limit) || 200, 500))
  if (officerId) builder = builder.eq('officer_id', officerId)
  if (region) builder = builder.eq('region', region)
  if (capability) builder = builder.eq('capability', capability)
  if (status) builder = builder.eq('status', status)
  const { data, error } = await builder
  if (error) throw asDispatchError('list', error)
  return data || []
}

export async function getDutyAssignment(id) {
  const { data, error } = await supabaseAdmin
    .from('duty_assignments')
    .select(DUTY_ASSIGNMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw asDispatchError('get', error)
  return data || null
}

// Active assignments for a set of officers within one region + capability —
// used for a precise pre-flight conflict response (the unique index remains the
// authoritative backstop under concurrency).
export async function findActiveAssignments({ officerIds, region, capability }) {
  const unique = Array.from(new Set((officerIds || []).filter(Boolean)))
  if (!unique.length) return []
  const { data, error } = await supabaseAdmin
    .from('duty_assignments')
    .select(DUTY_ASSIGNMENT_COLUMNS)
    .in('officer_id', unique)
    .eq('region', region)
    .eq('capability', capability)
    .in('status', ['ASSIGNED', 'IN_PROGRESS'])
  if (error) throw asDispatchError('active', error)
  return data || []
}

export async function updateDutyAssignmentStatus({ id, status }) {
  const { data, error } = await supabaseAdmin
    .from('duty_assignments')
    .update({ status })
    .eq('id', id)
    .select(DUTY_ASSIGNMENT_COLUMNS)
    .maybeSingle()
  if (error) {
    if (error.code === '23514') {
      throw new ApiError(400, 'INVALID_STATUS_TRANSITION', 'That assignment status change is not allowed.', {
        dbCode: error.code,
      })
    }
    throw asDispatchError('status', error)
  }
  return data || null
}
