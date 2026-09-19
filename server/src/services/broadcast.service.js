// MODULE 17 — BROADCAST SERVICE (authorization + audience resolution + fan-out)
//
// Authoritative logic for who may create/broadcast, which broadcasts a user may
// see (role + region + station + course scope), and who gets a notification when
// a broadcast is sent. The pure helpers (`mapBroadcastScopes`, `broadcastVisibleToActor`,
// `audienceCoversUser`) are exported so m17verify can lock the access matrix
// without a database. Everything else uses the service-role repository, so the
// browser can never name its own audience/ownership.

import { ApiError } from '../utils/apiResponse.js'
import { findProfileById } from '../repositories/user.repository.js'
import * as repo from '../repositories/broadcast.repository.js'

// ---------------------------------------------------------------------------
// Pure access-matrix helpers (unit-tested by m17verify.mjs, no DB).
// ---------------------------------------------------------------------------

// Normalises a broadcast (DB row) or create-payload into addressable scopes.
// Region/station/type/label live in legacy_raw on persisted rows; the create
// flow carries them as top-level fields until they are merged into legacy_raw.
// course_id is a top-level column, but legacy.courseId is accepted too so the
// pure scope reader is consistent for both persisted and in-memory shapes.
export function mapBroadcastScopes(entry = {}) {
  const legacy = entry.legacy_raw || {}
  return {
    roles: new Set(Array.isArray(entry.audience) ? entry.audience : []),
    region: legacy.region || null,
    station: legacy.station || null,
    courseId: entry.courseId || entry.course_id || legacy.courseId || legacy.course_id || null,
    type: legacy.type || null,
    label: legacy.label || null,
  }
}

// Where is this broadcast reachable? (used for the API projection, not auth)
export function scopesToLabels(scopes) {
  return {
    region: scopes.region,
    station: scopes.station,
    courseId: scopes.courseId,
    type: scopes.type,
    label: scopes.label,
  }
}

// Access matrix. actor = profile row (or API-shaped { role, station, region }).
// ctx = { enrolledCourseIds?, trainerCourseIds? }. Returns true when the actor
// may see the broadcast.
export function broadcastVisibleToActor(broadcast, actor, ctx = {}) {
  if (!broadcast || !actor) return false
  const scopes = mapBroadcastScopes(broadcast)
  return roleSeesBroadcast(actor, scopes, ctx)
}

function roleSeesBroadcast(actor, scopes, ctx) {
  if (actor.role === 'ADMIN') return true
  if (actor.role === 'TRAINER') {
    // Trainers see trainer-role notices and course-linked broadcasts for courses
    // they own (a course broadcast IS targeted at its enrolled class).
    if (scopes.roles.has('trainer')) return true
    if (scopes.courseId && ctx.trainerCourseIds && ctx.trainerCourseIds.includes(scopes.courseId)) return true
    return false
  }
  if (actor.role === 'TRAINEE') {
    if (!scopes.roles.has('trainee')) return false
    if (scopes.courseId) {
      if (!ctx.enrolledCourseIds || !ctx.enrolledCourseIds.includes(scopes.courseId)) return false
    }
    if (scopes.region && actor.region && String(scopes.region).toLowerCase() !== String(actor.region).toLowerCase()) return false
    if (scopes.station && actor.station && String(scopes.station).toLowerCase() !== String(actor.station).toLowerCase()) return false
    return true
  }
  return false
}

// Does a candidate fan-out user fall under a broadcast's addressable scopes?
// user = API profile shape { role, station, region }; ctx = { enrolledCourseIds? }.
export function audienceCoversUser(user, scopes, ctx = {}) {
  if (!user || !scopes) return false
  const role = String(user.role || '').toLowerCase()
  if (!scopes.roles.has(role)) return false
  if (scopes.courseId) {
    if (!ctx.enrolledCourseIds || !ctx.enrolledCourseIds.includes(scopes.courseId)) return false
  }
  if (scopes.region && String(scopes.region).toLowerCase() !== String(user.region || '').toLowerCase()) return false
  if (scopes.station && String(scopes.station).toLowerCase() !== String(user.station || '').toLowerCase()) return false
  return true
}

// ---------------------------------------------------------------------------
// API projection
// ---------------------------------------------------------------------------

export function mapBroadcast(row) {
  if (!row) return null
  const scopes = mapBroadcastScopes(row)
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: Array.isArray(row.audience) ? row.audience : [],
    courseId: scopes.courseId,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...scopesToLabels(scopes),
  }
}

// ---------------------------------------------------------------------------
// Authoritative operations
// ---------------------------------------------------------------------------

export async function createBroadcast({ actor, payload }) {
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  if (actor.role === 'TRAINER') {
    // Trainers may only post course-linked training notices to their own class.
    if (!payload.courseId) {
      throw new ApiError(400, 'COURSE_LINK_REQUIRED', 'A trainer broadcast must be linked to a course you own.')
    }
    const owner = await repo.findCourseOwner(payload.courseId)
    if (String(owner) !== String(actor.id)) {
      throw new ApiError(403, 'NOT_COURSE_OWNER', 'You can only broadcast to trainees of a course you own.')
    }
    if (payload.audience.some((r) => r === 'trainer')) {
      throw new ApiError(403, 'TRAINER_AUDIENCE_FORBIDDEN', 'Trainers can only broadcast to trainee audiences.')
    }
  }

  const row = {
    title: payload.title,
    body: payload.body,
    audience: payload.audience,
    course_id: payload.courseId || null,
    created_by: actor.id,
    legacy_raw: {
      type: payload.type || 'Training announcement',
      region: payload.region || null,
      station: payload.station || null,
      label: payload.label || null,
    },
  }

  const stored = await repo.insertBroadcast(row)
  const scopes = mapBroadcastScopes(stored)
  const deliveredCount = await fanOutNotification(stored, scopes)

  return { broadcast: mapBroadcast(stored), deliveredCount }
}

// Notifications are generated backend-side for the resolved audience. Course
// linked broadcasts go to the course's enrolled trainees; role/region/station
// addressing fans out through the user directory.
async function fanOutNotification(broadcast, scopes) {
  const targetIds = scopes.courseId
    ? await repo.listEnrolledUserIds(scopes.courseId)
    : await repo.listUsersByRoles({
        roles: Array.from(scopes.roles),
        region: scopes.region,
        station: scopes.station,
      })
  const notifications = targetIds.map((userId) => ({
    user_id: userId,
    broadcast_id: broadcast.id,
    title: broadcast.title,
    body: broadcast.body,
  }))
  return repo.insertNotifications(notifications)
}

export async function listBroadcasts({ actor }) {
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  if (actor.role === 'ADMIN') {
    const rows = await repo.listBroadcasts()
    return { broadcasts: rows.map(mapBroadcast) }
  }

  const profile = actor.role
    ? actor
    : await findProfileById(actor.id)
  if (!profile) throw new ApiError(403, 'PROFILE_NOT_FOUND', 'No application profile exists for this user.')

  const candidateRoles = profile.role === 'TRAINEE' ? ['trainee'] : ['trainee', 'trainer']
  let ctx = { enrolledCourseIds: [], trainerCourseIds: [] }
  let candidateRows
  if (profile.role === 'TRAINEE') {
    candidateRows = await repo.listBroadcastsByRoles(candidateRoles)
    ctx.enrolledCourseIds = await repo.listEnrolledCourseIds(profile.id)
  } else {
    candidateRows = await repo.listBroadcastsByRoles(candidateRoles)
    ctx.trainerCourseIds = await repo.listTrainerCourseIds(profile.id)
  }
  const visible = candidateRows.filter((r) => broadcastVisibleToActor(r, profile, ctx))
  return { broadcasts: visible.map(mapBroadcast) }
}

export async function deleteBroadcast({ actor, id }) {
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const existing = await repo.findBroadcastById(id)
  if (!existing) throw new ApiError(404, 'BROADCAST_NOT_FOUND', 'No such broadcast exists.')
  await repo.deleteBroadcast(id)
  return { deleted: true, broadcastId: id }
}