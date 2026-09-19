// MODULE 17 — BROADCAST & NOTIFICATION-FANOUT REPOSITORY
//
// Thin data-access layer over the public.broadcasts / public.notifications /
// public.enrollments relations (FROZEN Module 5 schema). It never invents
// columns, never applies authorization (that is the service layer's job), and
// returns rows as-is so the service owns the API projection.
//
// Fan-out inserts use bounded batches so a single broadcast addressed to a large
// training audience (e.g. every approved trainee) never builds one giant array.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'
import { insertNotifications } from './notification.repository.js'

export { insertNotifications }

const BROADCAST_COLUMNS = 'id, title, body, audience, course_id, created_by, created_at, legacy_raw'

function asBroadcastError(operation, error) {
  return new ApiError(500, `BROADCAST_${operation.toUpperCase()}_UNEXPECTED`, 'The broadcast could not be processed. Please try again.', {
    dbCode: error?.code,
    dbMessage: error?.message,
  })
}

export async function insertBroadcast(row) {
  const { data, error } = await supabaseAdmin
    .from('broadcasts')
    .insert(row)
    .select(BROADCAST_COLUMNS)
    .single()
  if (error) throw asBroadcastError('create', error)
  return data
}

export async function listBroadcasts({ limit = 200 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('broadcasts')
    .select(BROADCAST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw asBroadcastError('list', error)
  return data || []
}

// Broadcasts whose audience overlaps ANY of the caller's candidate roles. Exact
// visibility is decided by the service (region/station/course scope), but this
// narrows the rows the service has to inspect.
export async function listBroadcastsByRoles(roles, { limit = 200 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('broadcasts')
    .select(BROADCAST_COLUMNS)
    .overlaps('audience', roles)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw asBroadcastError('list', error)
  return data || []
}

export async function findBroadcastById(id) {
  const { data, error } = await supabaseAdmin
    .from('broadcasts')
    .select(BROADCAST_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw asBroadcastError('lookup', error)
  return data
}

export async function deleteBroadcast(id) {
  const { error } = await supabaseAdmin.from('broadcasts').delete().eq('id', id)
  if (error) throw asBroadcastError('delete', error)
  return true
}

// Returns the owning trainer_id for a course, or null when the row is absent.
export async function findCourseOwner(courseId) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('trainer_id')
    .eq('id', courseId)
    .maybeSingle()
  if (error) throw asBroadcastError('lookup', error)
  return data ? data.trainer_id : null
}

// Trainee course ids (used both to scope a trainee's view of course-linked
// broadcasts and to fan a trainer's course broadcast out to its enrolled class).
export async function listEnrolledCourseIds(userId) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('course_id')
    .eq('user_id', userId)
  if (error) throw asBroadcastError('lookup', error)
  return (data || []).map((r) => r.course_id)
}

// Courses owned by a trainer — scopes the trainer's view of course-related
// broadcasts and guards trainer-created course broadcasts.
export async function listTrainerCourseIds(trainerId) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('trainer_id', trainerId)
  if (error) throw asBroadcastError('lookup', error)
  return (data || []).map((r) => r.id)
}

// Trainees enrolled in a specific course — the delivery list for course-linked
// broadcasts (trainer notices / admin course announcements).
export async function listEnrolledUserIds(courseId) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('user_id')
    .eq('course_id', courseId)
  if (error) throw asBroadcastError('lookup', error)
  return (data || []).map((r) => r.user_id)
}

// User rows that satisfy a role + optional region/station scoping. Used to fan
// out non-course broadcasts (e.g. "all trainees" / "Western Region").
export async function listUsersByRoles({ roles, region, station }) {
  let builder = supabaseAdmin.from('users').select('id').in('role', roles.map((r) => r.toUpperCase()))
  if (region) builder = builder.eq('region', region)
  if (station) builder = builder.eq('station', station)
  const { data, error } = await builder
  if (error) throw asBroadcastError('lookup', error)
  return (data || []).map((r) => r.id)
}

// Batch notification fan-out is delegated to the canonical writer in
// notification.repository.js (re-exported above). The broadcast module owns its
// delivery story in one place; notifications carry their own title/body snapshot
// so they stay readable even if the source broadcast is later deleted.