// MODULE 12 — CERTIFICATE API CLIENT (frontend)
//
// Thin wrapper around the EXISTING `src/services/api.js` singleton — NEVER a
// second HTTP client (same rule as enrollmentApi.js). The backend is the only
// authority on certificates: this client NEVER fabricates a certificate, NEVER
// derives eligibility, and NEVER passes user_id/course_id (every value is
// derived server-side from the actor + enrollment row).

import { api, getAccessToken } from './api.js'

const auth = () => ({ token: getAccessToken() })

// Get (and, for the owning trainee, idempotently issue) the certificate for an
// enrollment. Returns the server's certificate view, or throws with the exact
// server message when not eligible (assessment not passed / feedback missing).
export async function getEnrollmentCertificate(enrollmentId) {
  return api.get(`/enrollments/${enrollmentId}/certificate`, auth())
}

// Role-scoped certificate list (trainee → own; trainer → owned courses;
// admin → all). Backs the trainee profile certificate sync.
export async function listCertificates() {
  return api.get('/certificates', auth())
}

// PUBLIC verification — no token is ever sent. Only verification-safe fields
// come back from the server (never email / ids / private enrollment data).
export async function verifyCertificate(verificationCode) {
  return api.get(`/certificates/verify/${encodeURIComponent(verificationCode)}`)
}