// MODULE 10 — ASSESSMENT API CLIENT (frontend)
//
// Thin wrapper around the EXISTING `src/services/api.js` singleton — NEVER a
// second HTTP client. The backend is authoritative: question selection,
// negative marking, percentage and pass/fail are computed server-side, so these
// functions only exchange questionId/optionIndex answers and display whatever
// result the backend returns. Correct answers are never present in trainee state.

import { api, getAccessToken } from './api.js'

// Start an assessment for the given enrollment. The backend decides the
// question set (20/30/50 distribution) and returns questions WITHOUT answers.
export async function startAssessment(enrollmentId) {
  return api.post(`/enrollments/${enrollmentId}/assessment/start`, undefined, {
    token: getAccessToken(),
  })
}

// Submit { answers: [{ questionId, optionIndex }], timeSpentSeconds }.
// Score/percentage/passed are server-calculated and returned.
export async function submitAssessment(enrollmentId, attemptId, payload) {
  return api.post(`/enrollments/${enrollmentId}/assessment/${attemptId}/submit`, payload, {
    token: getAccessToken(),
  })
}

// List this enrollment's assessment attempts (correct answers stripped server-side).
export async function listAssessmentAttempts(enrollmentId) {
  return api.get(`/enrollments/${enrollmentId}/assessment/attempts`, {
    token: getAccessToken(),
  })
}