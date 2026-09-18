// Supabase-backed authentication service (frontend side).
//
// Every call here targets the Express backend's /api/auth endpoints. The backend
// owns the Supabase Auth identity + public.users profile; the browser only holds
// the access token returned by login and sends it as `Authorization: Bearer ...`.
// The service-role key is server-only and never used on the client.

import { api, getAccessToken } from './api'

export async function register({
  fullName,
  email,
  password,
  station,
  department,
  empId,
  title,
  expertise,
  experience,
  role,
  professionalSummary,
  specializations,
  skills,
  qualifications,
  trainingInterests,
  achievements,
}) {
  const data = await api.post('/auth/register', {
    fullName,
    email,
    password,
    station,
    department,
    empId,
    title,
    expertise,
    experience,
    // role is validated server-side to TRAINEE | TRAINER and is NEVER honored as
    // ADMIN. Absent role defaults to TRAINEE.
    role,
    professionalSummary,
    specializations,
    skills,
    qualifications,
    trainingInterests,
    achievements,
  })
  return data
}

export async function login({ email, password }) {
  return api.post('/auth/login', { email, password })
}

export async function logout() {
  const token = getAccessToken()
  try {
    if (token) await api.post('/auth/logout', undefined, { token })
  } catch {
    // best-effort: the local session is cleared regardless of the backend result
  }
}

// Resolves the authenticated user's public profile (returned as { user, profile }).
export async function getCurrentUser() {
  const token = getAccessToken()
  if (!token) return null
  return api.get('/auth/me', { token })
}