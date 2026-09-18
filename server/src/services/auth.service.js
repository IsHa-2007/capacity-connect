import { supabase } from '../lib/supabase.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'
import { findProfileById, createProfile, toProfile } from '../repositories/user.repository.js'

function supabaseStatus(error, fallback) {
  return typeof error?.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : fallback
}

function isDuplicateEmail(error) {
  return error?.code === '23505' || error?.code === 'user_already_exists'
}

function asApiError(error, fallbackMessage, fallbackStatus = 400, code = 'REGISTRATION_FAILED') {
  if (error instanceof ApiError) return error
  if (isDuplicateEmail(error)) {
    return new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.', { dbCode: error.code })
  }
  return new ApiError(supabaseStatus(error, fallbackStatus), code, error?.message || fallbackMessage)
}

function toPublicProfile(profile) {
  return toProfile(profile)
}

// Public registration may REQUEST a TRAINEE or TRAINER account. Both roles are
// created with approval_status PENDING and verified by an administrator. The
// stored role is derived from the validated enum (TRAINEE/TRAINER) and can NEVER
// be ADMIN — an unrecognised or malicious value simply resolves to TRAINEE. This
// is enforced twice: the zod schema strips anything outside the enum, and the
// defensive ternary below guarantees the invariant even if a future caller skips
// the validator.
//
// `userId` is the auth.users id returned by the Admin createUser call. It is the
// public.users PRIMARY KEY (a NOT NULL FK to auth.users with no default), so it
// MUST be supplied here — omitting it violates the not-null constraint (23502).
function toProfileInsert(body, userId) {
  return {
    id: userId,
    email: body.email,
    name: body.fullName,
    role: body.role === 'TRAINER' ? 'TRAINER' : 'TRAINEE',
    approval_status: 'PENDING',
    department: body.department || null,
    emp_id: body.empId || null,
    station: body.station || null,
    title: body.title || null,
    professional_summary: body.professionalSummary || null,
    years_of_experience: body.experience || null,
    expertise: body.expertise ? [body.expertise] : [],
    specializations: Array.isArray(body.specializations) ? body.specializations : [],
    skills: Array.isArray(body.skills) ? body.skills : [],
    qualifications: Array.isArray(body.qualifications) ? body.qualifications : [],
    training_interests: Array.isArray(body.trainingInterests) ? body.trainingInterests : [],
    achievements: Array.isArray(body.achievements) ? body.achievements : [],
  }
}

export async function register(body) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName },
  })
  if (authError) throw asApiError(authError, 'Unable to create the account.', 400, 'REGISTRATION_FAILED')

  const userId = authData.user.id

  try {
    const profile = await createProfile(toProfileInsert(body, userId))
    return { user: toPublicProfile(profile) }
  } catch (createError) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId)
    } catch (cleanupError) {
      console.warn(`[auth] Could not clean up auth user ${userId} after profile failure:`, cleanupError?.message || cleanupError)
    }
    throw createError
  }
}

export async function login({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data?.session) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
  }

  let profile = null
  try {
    profile = await findProfileById(data.user.id)
  } catch {
    profile = null
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    profile: toPublicProfile(profile),
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  }
}

export async function logout(accessToken) {
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken)
  if (error) throw asApiError(error, 'Unable to sign out.', 400, 'LOGOUT_FAILED')
}

export async function getCurrentUser(accessToken) {
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data?.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', error?.message || 'Invalid or expired access token.')
  }

  let profile = null
  try {
    profile = await findProfileById(data.user.id)
  } catch {
    profile = null
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    profile: toPublicProfile(profile),
  }
}