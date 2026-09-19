// MODULE 9 — ENROLLMENT API CLIENT (frontend)
//
// Thin wrapper around the EXISTING `src/services/api.js` singleton — NEVER a
// second HTTP client. The backend is authoritative: user_id / course_id /
// trainer_id are derived server-side from the actor + course row, so these
// functions never send them and never read them back as write input.

import { api, getAccessToken } from './api.js'

// The workspace contract the backend returns (frozen, matches Module 9 spec):
// `{ enrollment, course, materials: { notes, slides, videos, practice } }`.
// Only material types that actually exist are ever returned. Module 11 extends
// the same envelope with authoritative `progress`, `assessment`, `feedback` and
// `completion` blocks plus per-type `notesDone/slidesDone/videoDone/practiceDone`
// flags on the enrollment copy.

const auth = () => ({ token: getAccessToken() })

export async function enroll(courseId) {
  return api.post('/enrollments', { courseId }, auth())
}

export async function listEnrollments() {
  return api.get('/enrollments', auth())
}

export async function getEnrollment(id) {
  return api.get(`/enrollments/${id}`, auth())
}

export async function getWorkspace(enrollmentId) {
  return api.get(`/enrollments/${enrollmentId}/workspace`, auth())
}

// Progression only (status / startedAt). Ownership, user_id, course_id and
// trainer_id can NEVER be patched — validated server-side. Note: `progress` and
// `completedAt` are backend-derived in Module 11 and no longer honored from a
// client payload.
export async function updateEnrollment(enrollmentId, patch) {
  return api.patch(`/enrollments/${enrollmentId}`, patch, auth())
}

// MODULE 11 — authoritative section-completion: the backend validates that the
// section belongs to the course and that every earlier section is complete, then
// derives the new progress server-side.
export async function markSectionComplete(enrollmentId, sectionId) {
  return api.post(`/enrollments/${enrollmentId}/progress`, { sectionId }, auth())
}

// MODULE 11 — feedback submission (only after the assessment is passed; the
// backend enforces eligibility — this is never merely hidden in the UI).
export async function submitFeedback(enrollmentId, feedback) {
  return api.patch(`/enrollments/${enrollmentId}/feedback`, feedback, auth())
}

// MODULE 11 — read feedback (trainee owner / owning trainer / admin).
export async function getEnrollmentFeedback(enrollmentId) {
  return api.get(`/enrollments/${enrollmentId}/feedback`, auth())
}

// MODULE 11 — trainer feedback analytics aggregations.
export async function getTrainerFeedbackAnalytics() {
  return api.get('/enrollments/analytics/feedback', auth())
}
