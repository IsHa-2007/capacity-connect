import { ApiError } from '../utils/apiResponse.js'
import {
  findProfileById,
  updateProfile,
  listProfiles,
  searchProfiles,
  updateRole,
  updateApprovalStatus,
  countProfiles,
  toProfile,
} from '../repositories/user.repository.js'

// API key -> public.users column for profile editing. Everything else (email,
// role, approval_status, id, firebase_uid, created_at, updated_at, region,
// profile_completion, photo columns, search_vector) is never writable here.
const EDITABLE_FIELDS = {
  fullName: 'name',
  title: 'title',
  department: 'department',
  station: 'station',
  professionalSummary: 'professional_summary',
  yearsOfExperience: 'years_of_experience',
  expertise: 'expertise',
  specializations: 'specializations',
  skills: 'skills',
  qualifications: 'qualifications',
  trainingInterests: 'training_interests',
  achievements: 'achievements',
}

const PUBLIC_VIEW_FIELDS = [
  'id',
  'fullName',
  'role',
  'title',
  'station',
  'region',
  'department',
  'professionalSummary',
  'yearsOfExperience',
  'expertise',
  'specializations',
  'skills',
  'qualifications',
  'trainingInterests',
  'achievements',
  'profileCompletion',
  'photoPublicId',
  'photoURL',
]

// Public-safe projection for approved (non-admin) profile viewers. Excludes
// email, empId and approvalStatus so peers cannot harvest identity data that is
// not needed for the public professional profile.
function publicProjection(profile) {
  const picked = {}
  for (const key of PUBLIC_VIEW_FIELDS) picked[key] = profile?.[key] ?? null
  return picked
}

function notFound() {
  return new ApiError(404, 'USER_NOT_FOUND', 'No such user exists.')
}

// Builds the public.users UPDATE patch from the validated body. Identity /
// permission fields never appear. When the station is (re)supplied, region is
// set NULL so the Module 5 compute_user_region trigger derives it. profile_completion
// is set NULL and `station` is always part of the update set so the
// compute_profile_completion trigger (whose OF clause includes station) fires
// even when only non-trigger fields (training interests, achievements, photo)
// were edited — the trigger recomputes the score when it is NULL.
function toUpdatePatch(body, existing) {
  const patch = {}

  for (const [apiKey, dbKey] of Object.entries(EDITABLE_FIELDS)) {
    if (body[apiKey] !== undefined) {
      patch[dbKey] = Array.isArray(body[apiKey]) ? body[apiKey].filter(Boolean) : body[apiKey]
    }
  }

  if (body.photoPublicId !== undefined) {
    const publicId = String(body.photoPublicId || '').trim()
    if (publicId) {
      patch.profile_photo_bucket = 'cloudinary'
      patch.profile_photo_path = publicId
      patch.profile_photo_mime = body.photoMimeType || null
      patch.profile_photo_size = body.photoSize ?? null
      patch.profile_photo_filename = body.photoFilename || null
    } else {
      patch.profile_photo_bucket = null
      patch.profile_photo_path = null
      patch.profile_photo_mime = null
      patch.profile_photo_size = null
      patch.profile_photo_filename = null
    }
  }

  const hasEditableContent = Object.keys(EDITABLE_FIELDS).some((k) => body[k] !== undefined)
  const hasPhotoEdit = body.photoPublicId !== undefined
  if (!hasEditableContent && !hasPhotoEdit) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'No editable profile fields were provided.')
  }

  // Always include station so the completion trigger fires (see above). The
  // value round-trips when the caller did not change the station.
  patch.station = body.station !== undefined ? body.station : existing.station ?? null
  if (body.station !== undefined) patch.region = null
  patch.profile_completion = null

  return patch
}

export async function getMe(userId) {
  const profile = await findProfileById(userId)
  if (!profile) {
    throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Your application profile could not be found. Contact support.')
  }
  return { user: { id: profile.id, email: profile.email }, profile: toProfile(profile) }
}

export async function updateMe(userId, body) {
  const existing = await findProfileById(userId)
  if (!existing) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Your application profile could not be found. Contact support.')
  const patch = toUpdatePatch(body, existing)
  const updated = await updateProfile(userId, patch)
  return { profile: toProfile(updated) }
}

// ADMIN: full directory (newest first). A single listing call keeps the
// verification queue + history + management screens backed by the same
// authoritative source.
export async function listUsers({ limit = 200 } = {}) {
  const rows = await listProfiles({ limit })
  return { users: rows.map(toProfile) }
}

// ADMIN: capability search across ALL users via users.search_vector. Role-
// independent by design (the RBAC guard lives at the route layer). The search
// text is capped to keep pathological queries out of plainto_tsquery.
export async function searchUsers(query, { limit = 50 } = {}) {
  const q = String(query || '').trim().slice(0, 200)
  const rows = await searchProfiles(q, { limit })
  return { results: rows.map(toProfile) }
}

// RBAC-aware single-user read.
//   - The target user is always allowed to read their own full profile.
//   - APPROVED admins may read any full profile (including email/empId).
//   - Any APPROVED user may read the public projection (no email/empId).
//   - PENDING / REJECTED callers get 403 APPROVAL_REQUIRED.
export async function getUserById(targetId, requesterId) {
  const target = await findProfileById(targetId)
  if (!target) throw notFound()

  if (String(targetId) === String(requesterId)) return { user: toProfile(target) }

  const requester = await findProfileById(requesterId)
  if (!requester) {
    throw new ApiError(403, 'PROFILE_NOT_FOUND', 'Your application profile could not be resolved.')
  }
  if (requester.role === 'ADMIN' && requester.approval_status === 'APPROVED') {
    return { user: toProfile(target) }
  }
  if (requester.approval_status !== 'APPROVED') {
    throw new ApiError(403, 'APPROVAL_REQUIRED', 'Your account has not been approved yet.')
  }
  return { user: publicProjection(toProfile(target)) }
}

// ADMIN: change a user's role. Prevents demoting the only APPROVED administrator
// (the platform's governance account) to guard against total lockout.
export async function changeUserRole(userId, role) {
  const current = await findProfileById(userId)
  if (!current) throw notFound()

  if (current.role === 'ADMIN' && role !== 'ADMIN') {
    const admins = await countProfiles({ role: 'ADMIN', approval_status: 'APPROVED' })
    if (admins <= 1) {
      throw new ApiError(
        400,
        'ROLE_LOCKED',
        'The last approved administrator cannot be demoted. Provision another administrator first.',
      )
    }
  }

  const updated = await updateRole(userId, role)
  return { user: toProfile(updated) }
}

// ADMIN: set a user's approval status. The same last-admin guard prevents the
// sole APPROVED administrator from being rejected.
export async function changeApprovalStatus(userId, approvalStatus) {
  const current = await findProfileById(userId)
  if (!current) throw notFound()

  if (approvalStatus === 'REJECTED' && current.role === 'ADMIN' && current.approval_status === 'APPROVED') {
    const admins = await countProfiles({ role: 'ADMIN', approval_status: 'APPROVED' })
    if (admins <= 1) {
      throw new ApiError(
        400,
        'ROLE_LOCKED',
        'The last approved administrator cannot be rejected. Provision another administrator first.',
      )
    }
  }

  const updated = await updateApprovalStatus(userId, approvalStatus)
  return { user: toProfile(updated) }
}