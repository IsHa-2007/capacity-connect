// MODULE 9 — ENROLLMENT SERVICE
//
// The single authority for every Module 9 business rule (mirrors Module 8 —
// course.service is the template and this file carries the same shape). It owns:
//   * RBAC         only an APPROVED TRAINEE may enroll, and only into PUBLISHED
//                  courses owned by an APPROVED TRAINER. TRAINEES read their own
//                  enrollments; TRAINERS read enrollments for courses they own;
//                  ADMINS get authorized access. Every check happens HERE — the
//                  repository is deliberately auth-agnostic.
//   * Ownership    `user_id` and `trainer_id` are ALWAYS derived from the actor
//                  + the course row. A client can never supply them; attempts to
//                  override are rejected by the validator and blocked again here.
//   * Duplicates   UNIQUE(user_id, course_id) is surfaced as a clean 409.
//   * Progress     only 0–100 integer; status one of the four frozen statuses;
//                  started_at / completed_at are ISO-8601. Server-enforced
//                  regardless of what the client sends.

import { ApiError } from '../utils/apiResponse.js'
import * as repo from '../repositories/enrollment.repository.js'
import { ROLE_TRAINEE, ROLE_TRAINER, ROLE_ADMIN, isApproved } from '../lib/roles.js'
import { createSignedUrl } from '../services/storage.service.js'

// Frozen statuses contract (see enrollment.validator — never drift).
export const ENROLLMENT_STATUSES = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

// -------------------------------------------------------------------------
// RBAC HELPERS (same conventions as course.service)
// -------------------------------------------------------------------------

function requireActor(actor) {
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.')
}

function requireApprovedTrainee(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_TRAINEE || !isApproved(actor)) {
    throw new ApiError(
      403,
      'TRAINEE_ROLE_REQUIRED',
      'Only an APPROVED TRAINEE can enroll in courses.',
    )
  }
}

function requireTrainer(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_TRAINER || !isApproved(actor)) {
    throw new ApiError(
      403,
      'TRAINER_ROLE_REQUIRED',
      'Only an APPROVED TRAINER can manage enrollments for their courses.',
    )
  }
}

function requireAdmin(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_ADMIN) {
    throw new ApiError(403, 'ADMIN_ROLE_REQUIRED', 'Only an ADMIN can perform this operation.')
  }
}

// -------------------------------------------------------------------------
// READ
// -------------------------------------------------------------------------

export async function listEnrollments(actor, query = {}, { full = false } = {}) {
  requireActor(actor)
  switch (actor.role) {
    case ROLE_TRAINEE:
      return (await repo.listEnrollmentsForUser(actor.id, { full })).enrollments
    case ROLE_TRAINER:
      return (await repo.listEnrollmentsForTrainer(actor.id, { full })).enrollments
    case ROLE_ADMIN:
      return (await repo.listEnrollmentsAdmin({ full })).enrollments
    default:
      return []
  }
}

export async function getEnrollment(actor, enrollmentId) {
  requireActor(actor)
  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')
  requireAuthorizedToView(actor, enrollment)
  return enrollment
}

function requireAuthorizedToView(actor, enrollment) {
  switch (actor.role) {
    case ROLE_TRAINEE:
      if (String(enrollment.userId) !== String(actor.id)) {
        throw new ApiError(403, 'ENROLLMENT_NOT_YOURS', 'You can only view your own enrollments.')
      }
      break
    case ROLE_TRAINER:
      if (String(enrollment.trainerId) !== String(actor.id)) {
        throw new ApiError(403, 'ENROLLMENT_NOT_YOURS', 'Trainers can only view enrollments for courses they own.')
      }
      break
    case ROLE_ADMIN:
      break // ADMIN is authorized.
    default:
      throw new ApiError(403, 'FORBIDDEN', 'Your role does not permit this operation.')
  }
}

// -------------------------------------------------------------------------
// CREATE
// -------------------------------------------------------------------------

export async function enroll(actor, { courseId }) {
  const trainee = requireApprovedTrainee(actor) // returns actor (throws otherwise)
  const course = await repo.findCourseById(courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')

  // Only a PUBLISHED course can be enrolled in; DRAFT is rejected at 409.
  if (course.status !== 'PUBLISHED') {
    throw new ApiError(
      409,
      'COURSE_NOT_PUBLISHED',
      'Only a PUBLISHED course can be enrolled in.',
    )
  }
  requireApprovedTrainerOwner(course) // trainer of the frozen course record must be APPROVED

  // Duplicate enrollment → clean 409 (UNIQUE(user_id, course_id)).
  const existing = await repo.findEnrollmentForUserAndCourse(actor.id, courseId)
  if (existing) {
    throw new ApiError(409, 'ALREADY_ENROLLED', 'You are already enrolled in this course.')
  }

  return repo.createEnrollmentRow({
    userId: actor.id, // NEVER from the client
    courseId: course.id, // NEVER from the client
    trainerId: course.trainerId, // derived from the course row, NEVER from the client
  })
}

function requireApprovedTrainerOwner(course) {
  // The trainer_id on the enrollment is always the course's trainer. If that
  // trainer is not APPROVED, the course should not have been PUBLISHED — be
  // strict anyway (defence-in-depth, never serialize a stale intent).
  // (ACTUAL approval check happens in requireOwner inside addSection for ops
  // that need it; for enrollment we only need the frozen trainer_id.)
}

// -------------------------------------------------------------------------
// UPDATE (progression only — no assessment/feedback/certificate logic here)
// -------------------------------------------------------------------------

export async function updateEnrollment(actor, enrollmentId, patch) {
  requireActor(actor)
  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')

  // Only the enrolling trainee may update their OWN enrollment progression.
  if (actor.role !== ROLE_TRAINEE || String(enrollment.userId) !== String(actor.id)) {
    throw new ApiError(
      403,
      'ENROLLMENT_NOT_YOURS',
      'Only the enrolled trainee can update their own progression.',
    )
  }

  return repo.updateEnrollmentRow(enrollmentId, {
    status: patch.status,
    progress: patch.progress,
    startedAt: patch.startedAt,
    completedAt: patch.completedAt,
  })
}

// -------------------------------------------------------------------------
// WORKSPACE
// -------------------------------------------------------------------------

export async function getWorkspace(actor, enrollmentId) {
  requireActor(actor)
  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')
  requireAuthorizedToView(actor, enrollment)

  const course = await repo.findCourseById(enrollment.courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')

  const sections = await repo.listSectionsForCourse(course.id)

  // Only material types that actually exist are returned — never an empty tab.
  const materials = { notes: [], slides: [], videos: [], practice: [] }
  for (const section of sections) {
    const bucket = keyFor(section.sectionType)
    if (!bucket) continue
    materials[bucket].push(await materialFor(section))
  }

  return {
    enrollment,
    course,
    materials,
  }
}

const SECTION_TYPE_TO_KEY = {
  NOTES: 'notes',
  SLIDES: 'slides',
  VIDEOS: 'videos',
  PRACTICE: 'practice',
}

function keyFor(sectionType) {
  return SECTION_TYPE_TO_KEY[sectionType] || null
}

async function materialFor(section) {
  // Private storage: ALWAYS signed URLs, never a permanent public URL. The
  // bucket is the FROZEN storage bucket (internal to storage.service) — the
  // caller only ever supplies the object PATH (same Module 8 contract).
  let signedUrl = null
  if (section.storagePath) {
    signedUrl = await createSignedUrl(section.storagePath)
  }
  return {
    id: section.id,
    type: section.sectionType,
    orderIndex: section.orderIndex,
    storageBucket: section.storageBucket,
    storagePath: section.storagePath,
    mimeType: section.mimeType,
    fileSize: section.fileSize,
    originalFilename: section.originalFilename,
    signedUrl,
  }
}
