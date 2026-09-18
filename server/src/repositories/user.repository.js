import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

// Column map for public.users. NOTE: the applied Module 5 migration defines the
// display-name column as `name` (NOT `full_name`) and it is NOT NULL. sensitive
// auth data (password) lives in auth.users, never here. search_vector is read by
// the admin capability search but is never returned to the client.

export const USER_COLUMNS =
  'id, email, name, role, approval_status, department, emp_id, station, region, title, professional_summary, years_of_experience, expertise, specializations, skills, qualifications, training_interests, achievements, profile_completion, profile_photo_bucket, profile_photo_path, profile_photo_mime, profile_photo_size, profile_photo_filename, created_at, updated_at'

// Back-compat alias (kept for anything importing the earlier contract).
export const PROFILE_COLUMNS = USER_COLUMNS

function asProfileError(operation, error) {
  const code = error?.code
  const name = {
    lookup: 'PROFILE_LOOKUP',
    create: 'PROFILE_CREATE',
    update: 'PROFILE_UPDATE',
    list: 'PROFILE_LIST',
    search: 'PROFILE_SEARCH',
  }[operation] || 'PROFILE'

  if (code === '42P01') {
    return new ApiError(
      503,
      `${name}_UNAVAILABLE`,
      'The application profile cannot be processed because the public.users relation is missing. Apply the Module 5 schema migration first.',
      { dbCode: code },
    )
  }

  if (code === '23505') {
    return new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.', { dbCode: code })
  }

  const fallback = operation === 'lookup'
    ? 'The application profile could not be resolved. Please try again.'
    : 'The profile operation could not be completed. Please try again.'
  return new ApiError(500, `${name}_UNEXPECTED`, fallback, { dbCode: code, dbMessage: error?.message })
}

// Converts a public.users row into the API-facing profile shape. The Cloudinary
// public_id is exposed as `photoPublicId`; the browser builds the final delivery
// URL from its own VITE_CLOUDINARY_CLOUD_NAME (the backend never embeds upload
// storage URLs). `photoURL` is left null here so legacy/mock images (which carry
// an absolute photoURL) are unaffected.
export function toProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    fullName: row.name,
    role: row.role,
    approvalStatus: row.approval_status,
    department: row.department,
    empId: row.emp_id,
    station: row.station,
    region: row.region,
    title: row.title,
    professionalSummary: row.professional_summary,
    yearsOfExperience: row.years_of_experience,
    expertise: Array.isArray(row.expertise) ? row.expertise : [],
    specializations: Array.isArray(row.specializations) ? row.specializations : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    qualifications: Array.isArray(row.qualifications) ? row.qualifications : [],
    trainingInterests: Array.isArray(row.training_interests) ? row.training_interests : [],
    achievements: Array.isArray(row.achievements) ? row.achievements : [],
    profileCompletion: row.profile_completion,
    photoURL: null,
    photoPublicId: row.profile_photo_bucket === 'cloudinary' ? row.profile_photo_path : '',
    photoMimeType: row.profile_photo_mime,
    photoSize: row.profile_photo_size,
    photoFilename: row.profile_photo_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findProfileById(id) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw asProfileError('lookup', error)
  return data
}

export async function createProfile(profile) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .insert(profile)
    .select(USER_COLUMNS)
    .single()
  if (error) throw asProfileError('create', error)
  return data
}

export async function updateProfile(userId, patch) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select(USER_COLUMNS)
    .maybeSingle()
  if (error) throw asProfileError('update', error)
  return data
}

export async function listProfiles({ limit = 200 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw asProfileError('list', error)
  return data || []
}

// Capability search across ALL users (any role), using the Module 5
// users.search_vector (maintained by the update_user_search_vector trigger over
// name, title, profile summary, department, station, region, emp_id, expertise,
// specializations, skills, qualifications, achievements and training interests).
// `plainto_tsquery` keeps punctuation-safe handling of phrases like "Python",
// "AI", "GIS", "Cybersecurity" or "Satellite imagery". An empty query simply
// returns the same truncated listing as listProfiles, so the admin search view
// degrades to a browse view instead of erroring.
export async function searchProfiles(query, { limit = 50 } = {}) {
  const trimmed = String(query || '').trim().toLowerCase()
  let builder = supabaseAdmin
    .from('users')
    .select(USER_COLUMNS)
  if (trimmed) {
    builder = builder.textSearch('search_vector', trimmed, { type: 'plain', config: 'english' })
  }
  const { data, error } = await builder.order('name', { ascending: true }).limit(limit)
  if (error) throw asProfileError('search', error)
  return data || []
}

// Count rows for the given equality conditions (used for the "last approved
// ADMIN demotion" guard). `head: true` returns only the count.
export async function countProfiles(conditions = {}) {
  let builder = supabaseAdmin.from('users').select('id', { count: 'exact', head: true })
  for (const [key, value] of Object.entries(conditions)) {
    builder = builder.eq(key, value)
  }
  const { count, error } = await builder
  if (error) throw asProfileError('list', error)
  return count || 0
}

export async function updateRole(userId, role) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ role })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .maybeSingle()
  if (error) throw asProfileError('update', error)
  return data
}

export async function updateApprovalStatus(userId, approvalStatus) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ approval_status: approvalStatus })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .maybeSingle()
  if (error) throw asProfileError('update', error)
  return data
}