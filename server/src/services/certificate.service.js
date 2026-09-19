// MODULE 12 — CERTIFICATE SERVICE
//
// The single authority for every Module 12 certificate rule (mirrors Modules
// 8–11: course/enrollment/assessment services are the templates). It owns:
//
//   * Eligibility    a certificate is issued ONLY when the enrollment is not
//                    CANCELLED, the frozen assessment passed, AND the mandatory
//                    feedback has been submitted. Both gates are read from the
//                    enrollment row — never from the client.
//   * Idempotency    one certificate per enrollment (UNIQUE(enrollment_id) in
//                    the DB is the final word). A repeated GET returns the
//                    existing certificate with its ORIGINAL number + issued_on.
//   * Concurrency    numbering uses a COLUMN-AWARE non-Count(*) mechanism:
//                    read the highest existing CC-YYYY-NNNNNN, then insert;
//                    on a UNIQUE violation the loop re-reads and retries, so
//                    two simultaneous issuances can never produce the same
//                    certificate_number or a duplicate enrollment row.
//   * Verification   the public verify endpoint returns ONLY verification-safe
//                    fields (number, trainee display name, course title/domain,
//                    issue date, completion status) — never email, ids, tokens
//                    or private enrollment data.
//   * RBAC           trainee = own enrollments; trainer (approved) = courses
//                    they own (enrollments.trainer_id is the frozen course
//                    trainer); admin = authorized. No id is accepted from the
//                    client — every value is derived from the actor + the
//                    enrollment row.
//
// The pure helpers are exported (Module 10/11 style) so m12verify.mjs can
// exercise eligibility, numbering and view-shaping WITHOUT a database. The DB-
// dependent services (issue / list / verify) run every check here as well.

import { ApiError } from '../utils/apiResponse.js'
import * as repo from '../repositories/certificate.repository.js'
import { findEnrollmentById, findCourseById } from '../repositories/enrollment.repository.js'
import { findProfileById } from '../repositories/user.repository.js'
import { ROLE_TRAINEE, ROLE_TRAINER, ROLE_ADMIN, isApproved } from '../lib/roles.js'

export const CERTIFICATE_PREFIX = 'CC'
export const CERTIFICATE_ISSUER_LABEL = 'Capacity Connect'
export const CERTIFICATE_YEAR_PATTERN = /^CC-(\d{4})-(\d+)$/

// ---------------------------------------------------------------------------
// PURE HELPERS (module-tested without a database)
// ---------------------------------------------------------------------------

// Feedback is considered submitted once at least one frozen feedback field is
// present — identical semantics to enrollment.service's workspace flag.
export function hasSubmittedFeedback(feedback) {
  return Boolean(
    feedback &&
      (feedback.contentDepth != null ||
        feedback.trainerDelivery != null ||
        feedback.operationalRelevance != null ||
        feedback.suggestions != null),
  )
}

// The two eligibility gates, in the exact order the UI surfaces them.
export function certificateEligibility(enrollment) {
  if (!enrollment) {
    return { eligible: false, code: 'CERTIFICATE_UNKNOWN_ENROLLMENT' }
  }
  if (enrollment.status === 'CANCELLED') {
    return { eligible: false, code: 'CERTIFICATE_CANCELLED', message: 'A cancelled enrollment cannot receive a certificate.' }
  }
  if (enrollment.assessment?.passed !== true) {
    return {
      eligible: false,
      code: 'CERTIFICATE_ASSESSMENT_REQUIRED',
      message: 'Certificate is not available until the assessment is passed.',
    }
  }
  if (!hasSubmittedFeedback(enrollment.feedback)) {
    return {
      eligible: false,
      code: 'CERTIFICATE_FEEDBACK_REQUIRED',
      message: 'Certificate is not available until feedback is submitted.',
    }
  }
  return { eligible: true }
}

// Parse the numeric sequence out of a CC-YYYY-NNNNNN number (or null).
export function parseCertificateNumber(certificateNumber) {
  const match = CERTIFICATE_YEAR_PATTERN.exec(String(certificateNumber || '').trim())
  if (!match) return null
  return { year: match[1], sequence: Number(match[2]) }
}

// Build the next certificate number for a year. `latest` is the highest
// existing number the repository read (or null). When the latest number's year
// differs (or it is not a CC-YYYY-NNNNNN) the sequence restarts at 1, which is
// exactly what the frozen "future numbering (CC-YYYY-NNNNNN)" note requires.
export function nextCertificateNumber({ year, latest = null }) {
  const parsed = parseCertificateNumber(latest)
  const seq = parsed && String(parsed.year) === String(year) ? parsed.sequence + 1 : 1
  return `${CERTIFICATE_PREFIX}-${year}-${String(seq).padStart(6, '0')}`
}

// View/authorization matrix — identical shape to canViewFeedback.
export function canViewCertificate(actor, enrollment) {
  if (!actor || !enrollment) return false
  if (actor.role === ROLE_TRAINEE) return String(enrollment.userId) === String(actor.id)
  if (actor.role === ROLE_TRAINER) return isApproved(actor) && String(enrollment.trainerId) === String(actor.id)
  if (actor.role === ROLE_ADMIN) return true
  return false
}

// ---------------------------------------------------------------------------
// RBAC HELPERS (same conventions as Modules 8–11)
// ---------------------------------------------------------------------------

function requireActor(actor) {
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.')
}

// ---------------------------------------------------------------------------
// ISSUE (get-or-create, idempotent)
// ---------------------------------------------------------------------------

export async function getOrIssueCertificate(actor, enrollmentId) {
  requireActor(actor)

  const enrollment = await findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')

  // Ownership first (before any read): trainee must own the enrollment; a
  // trainer may only read certificates for courses they own; admin authorized.
  if (!canViewCertificate(actor, enrollment)) {
    throw new ApiError(
      403,
      'CERTIFICATE_ACCESS_DENIED',
      'You are not authorized to access this certificate.',
    )
  }

  const course = await findCourseById(enrollment.courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')

  const trainee = await findProfileById(enrollment.userId)
  if (!trainee) throw new ApiError(404, 'USER_NOT_FOUND', 'The certificate recipient profile could not be found.')

  // A trainer/admin calls this endpoint to READ an already-issued certificate
  // (never to trigger issuance). Only the enrolling trainee may initiate.
  const ownerPath = actor.role === ROLE_TRAINEE && String(enrollment.userId) === String(actor.id)
  if (!ownerPath) {
    const existing = await repo.findCertificateByEnrollmentId(enrollment.id)
    if (!existing) throw new ApiError(404, 'CERTIFICATE_NOT_FOUND', 'No certificate has been issued for this enrollment yet.')
    return certificateView(existing, { enrollment, course, trainee })
  }

  // Idempotency: a repeat request returns the ORIGINAL certificate untouched.
  const existing = await repo.findCertificateByEnrollmentId(enrollment.id)
  if (existing) return certificateView(existing, { enrollment, course, trainee })

  // The two eligibility gates — backend-authoritative, never merely hidden.
  const gate = certificateEligibility(enrollment)
  if (!gate.eligible) {
    const status = gate.code === 'CERTIFICATE_CANCELLED' ? 409 : 403
    throw new ApiError(status, gate.code, gate.message)
  }

  // Concurrency-safe numbering: read the highest existing number for the year,
  // insert; on a UNIQUE violation re-read and retry (bounded). The DB UNIQUE
  // constraints (enrollment_id, certificate_number) are the final arbiters.
  const year = new Date().getUTCFullYear()
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await repo.latestCertificateNumberForYear(year)
    const certificateNumber = nextCertificateNumber({ year, latest })
    try {
      const certificate = await repo.insertCertificateRow({
        enrollmentId: enrollment.id,
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        certificateNumber,
        issuedOn: new Date().toISOString(),
        issuedBy: null, // platform-issued: the identity in the view is the issuer label
      })
      return certificateView(certificate, { enrollment, course, trainee })
    } catch (err) {
      // Not a unique-violation conflict → surface the underlying error.
      if (!(err instanceof ApiError) || err.status !== 409) throw err
      // Concurrent issuances: either the SAME enrollment already got a
      // certificate (re-read idempotently) or the number collided (re-loop
      // with the fresh max). Re-check before assuming it is only a number race.
      const reissue = await repo.findCertificateByEnrollmentId(enrollment.id)
      if (reissue) return certificateView(reissue, { enrollment, course, trainee })
      if (attempt === 4) {
        throw new ApiError(500, 'CERTIFICATE_ISSUE_CONFLICT', 'The certificate could not be issued right now. Please try again.')
      }
    }
  }
  throw new ApiError(500, 'CERTIFICATE_ISSUE_CONFLICT', 'The certificate could not be issued right now. Please try again.')
}

// ---------------------------------------------------------------------------
// LIST (profile sync / trainer inventory / admin)
// ---------------------------------------------------------------------------

export async function listCertificates(actor) {
  requireActor(actor)
  switch (actor.role) {
    case ROLE_TRAINEE:
      return repo.listCertificatesForUser(actor.id)
    case ROLE_TRAINER:
      if (!isApproved(actor)) throw new ApiError(403, 'TRAINER_ROLE_REQUIRED', 'Your account must be approved.')
      // Certificates for the courses this trainer owns — derived from the
      // course rows, never from a client-supplied course list.
      const courses = await repo.courseIdsForTrainer(actor.id)
      return repo.listCertificatesForCourses(courses)
    case ROLE_ADMIN:
      return (await repo.listCertificatesAdmin()).certificates
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// VERIFICATION (public, verification-safe only)
// ---------------------------------------------------------------------------

export async function verifyCertificate(verificationCode) {
  const code = String(verificationCode || '').trim().toUpperCase()
  if (!code) return { valid: false }

  const certificate = await repo.findCertificateByNumber(code)
  if (!certificate) return { valid: false }

  const enrollment = await findEnrollmentById(certificate.enrollmentId).catch(() => null)
  const trainee = await findProfileById(certificate.userId).catch(() => null)
  const course = await findCourseById(certificate.courseId).catch(() => null)

  return verificationView(certificate, {
    traineeName: trainee?.name ?? null,
    courseTitle: course?.title ?? null,
    courseDomain: course?.domain ?? null,
    completionStatus: enrollment?.status ?? null,
  })
}

// ---------------------------------------------------------------------------
// VIEW SHAPING (pure, module-tested)
// ---------------------------------------------------------------------------

// Owner/trainer/admin view of an issued certificate (includes the internal id
// so the authenticated UI can key rows; verification uses the public shape).
export function certificateView(certificate, { enrollment, course, trainee }) {
  return {
    certificate: {
      id: certificate.id,
      enrollmentId: certificate.enrollmentId,
      certificateNumber: certificate.certificateNumber,
      legacyCertificateId: certificate.legacyCertificateId,
      issuedOn: certificate.issuedOn,
      createdAt: certificate.createdAt,
    },
    trainee: {
      id: certificate.userId,
      name: trainee?.name ?? null,
    },
    course: {
      id: certificate.courseId,
      title: course?.title ?? null,
      domain: course?.domain ?? null,
    },
    assessment: {
      percentage: enrollment?.assessment?.percentage ?? null,
      passed: enrollment?.assessment?.passed ?? null,
    },
    completionStatus: enrollment?.status ?? null,
    verification: {
      code: certificate.certificateNumber,
      issuer: CERTIFICATE_ISSUER_LABEL,
    },
  }
}

// PUBLIC safe shape — intentionally REFUSES to echo email, ids, phone, tokens
// or private enrollment/attempt data. Only what a third party should be able
// to confirm about the paper certificate itself.
export function verificationView(certificate, { traineeName, courseTitle, courseDomain, completionStatus }) {
  return {
    valid: true,
    certificateNumber: certificate.certificateNumber,
    traineeName,
    courseTitle,
    courseDomain,
    issueDate: certificate.issuedOn,
    completionStatus,
    issuer: CERTIFICATE_ISSUER_LABEL,
  }
}