// MODULE 9 — ENROLLMENT API CLIENT (frontend)
//
// Thin wrapper around the EXISTING `src/services/api.js` singleton — NEVER a
// second HTTP client. The backend is authoritative: user_id / course_id /
// trainer_id are derived server-side from the actor + course row, so these
// functions never send them and never read them back as write input.

import { api } from './api.js'

// The workspace contract the backend returns (frozen, matches Module 9 spec):
// `{ enrollment, course, materials: { notes, slides, videos, practice } }`.
// Only material types that actually exist are ever returned.

export async function enroll(courseId) {
  return api.post('/enrollments', { courseId })
}

export async function listEnrollments() {
  return api.get('/enrollments')
}

export async function getEnrollment(id) {
  return api.get(`/enrollments/${id}`)
}

export async function getWorkspace(enrollmentId) {
  return api.get(`/enrollments/${enrollmentId}/workspace`)
}

// Progression only (status / progress / startedAt / completedAt). Ownership,
// user_id, course_id and trainer_id can NEVER be patched — validated server-side.
export async function updateEnrollment(enrollmentId, patch) {
  return api.patch(`/enrollments/${enrollmentId}`, patch)
}
