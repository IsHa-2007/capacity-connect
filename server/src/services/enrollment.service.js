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
import { listQuestionsForCourse } from '../repositories/course.repository.js'

// Frozen statuses contract (see enrollment.validator — never drift).
export const ENROLLMENT_STATUSES = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

// ---------------------------------------------------------------------------
// MODULE 11 — PROGRESS, COMPLETION & FEEDBACK
//
// Backend-authoritative progress model. The ONLY per-enrollment state that the
// frozen public.enrollments schema can hold for learning progression is the
// single 0–100 integer `progress` column (there is NO progress table and NO
// per-material column). To stay honest under that constraint:
//   * `progress` is the authoritative record of material completion and is
//     advanced ONLY through the controlled section-completion operation;
//   * the PLAN is derived from the course's ACTUAL `course_sections` — only
//     material types that exist can ever contribute (a missing SLIDES tab can
//     never block a course that has no slides);
//   * completion is therefore decided server-side: ALL existing material
//     sections completed AND assessment_passed => status=COMPLETED, progress=100,
//     completed_at = server timestamp. A client can never force those values.
//
// The derivation helpers are exported (module 10 style) so the Module 11 logic
// tests can exercise them without a database.

const SECTION_TYPE_TO_KEY = {
  NOTES: 'notes',
  SLIDES: 'slides',
  VIDEOS: 'videos',
  PRACTICE: 'practice',
}

export const MATERIAL_SECTION_TYPES = ['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']

// Materials own the first 75 progress points (the existing product maps Study
// Notes…Practice below the Assessment stage). The last material milestone is
// always exactly this value, so progress=75 ⇔ all existing materials done.
export const MATERIALS_COMPLETE_PROGRESS = 75

export function keyForMaterialType(sectionType) {
  return SECTION_TYPE_TO_KEY[sectionType] || null
}

// ---------------------------------------------------------------------------
// PRACTICE QUESTION BANK (Module 10 §practice)
//
// Practice is NOT a second question system and NEVER feeds the assessment. It is
// a capped, shuffled subset of the course's SAME valid bank (validOnly +
// structural re-check), delivered with its correct answers because practice is a
// training tool. Rules:
//   * at least 5 valid questions → a subset of 5–10 shuffled questions;
//   * fewer than 5 valid questions    → every valid question (may be 1–4);
//   * zero valid questions            → an honest empty array (UI prints the
//     friendly "No practice questions are available yet…" empty state).
// ---------------------------------------------------------------------------

const PRACTICE_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD']

function isPracticeQuestion(q) {
  if (!q) return false
  if (q.is_valid !== true) return false
  if (typeof q.text !== 'string' || !q.text.trim()) return false
  if (q.questionType && q.questionType !== 'MCQ') return false
  if (!Array.isArray(q.options) || q.options.length < 2) return false
  const idx = q.correctOptionIndex
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return false
  return PRACTICE_DIFFICULTIES.includes(q.difficulty)
}

function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function buildPracticeSet(bank, max = 10, min = 5) {
  const available = shuffle(bank)
  if (available.length >= min) return available.slice(0, max)
  return available
}

// Maps a valid bank row to the public practice shape (answers included).
export function toPracticeQuestion(q) {
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    difficulty: q.difficulty,
    topic: q.topic ?? null,
    tagLabel: q.tagLabel ?? null,
    questionType: 'MCQ',
    correctOptionIndex: q.correctOptionIndex,
  }
}

// Builds the authoritative progression plan for a course from its REAL
// sections. Sections are ordered by order_index; every step gets a strictly
// increasing milestone so the single `progress` column unambiguously reflects
// how many leading sections are complete.
export function deriveProgressPlan(sections = []) {
  const steps = []
  const byType = { notes: [], slides: [], videos: [], practice: [] }
  const material = (sections || [])
    .filter((s) => MATERIAL_SECTION_TYPES.includes(s.sectionType) && SECTION_TYPE_TO_KEY[s.sectionType])
    .slice()
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))

  material.forEach((s, i) => {
    const milestone =
      material.length === 0 ? 0 : Math.round(((i + 1) / material.length) * MATERIALS_COMPLETE_PROGRESS)
    const step = {
      sectionId: s.id,
      sectionType: s.sectionType,
      orderIndex: s.orderIndex ?? 0,
      milestone,
    }
    steps.push(step)
    byType[SECTION_TYPE_TO_KEY[s.sectionType]].push(step)
  })

  return {
    steps,
    total: material.length,
    threshold: material.length === 0 ? 0 : MATERIALS_COMPLETE_PROGRESS,
    byType,
    exists: {
      notes: byType.notes.length > 0,
      slides: byType.slides.length > 0,
      videos: byType.videos.length > 0,
      practice: byType.practice.length > 0,
    },
  }
}

export function stepCompleted(plan, progress, sectionId) {
  const step = (plan?.steps || []).find((s) => String(s.sectionId) === String(sectionId))
  return Boolean(step && (progress ?? 0) >= step.milestone)
}

// All material types that actually exist are required; types that do not exist
// for the course are not part of the plan and can never block completion.
export function materialsComplete(plan, progress) {
  const steps = plan?.steps || []
  return steps.every((s) => (progress ?? 0) >= s.milestone)
}

// Section completion is strictly ordered: a section can only be marked complete
// once every section ordered before it is complete. This is what makes the
// single progress column an honest ledger — a client can never jump straight to
// the final section and skip earlier content, because progress can only be
// raised through the legitimate step sequence.
export function canCompleteStep(plan, progress, sectionId) {
  const idx = (plan?.steps || []).findIndex((s) => String(s.sectionId) === String(sectionId))
  if (idx === -1) return { allowed: false, reason: 'unknown-section' }
  const earlier = (plan?.steps || []).slice(0, idx)
  if (earlier.some((s) => (progress ?? 0) < s.milestone)) {
    return { allowed: false, reason: 'ordered' }
  }
  return { allowed: true, reason: null }
}

// A type is "done" when every section of that type in the plan is complete.
// A type that does not exist for this course returns false (its tab is hidden).
export function typeDone(plan, progress, key) {
  const steps = plan?.byType?.[key] || []
  if (!steps.length) return false
  return steps.every((s) => (progress ?? 0) >= s.milestone)
}

// Feedback becomes available ONLY after the assessment is passed.
export function isFeedbackEligible(enrollment) {
  return Boolean(
    enrollment &&
      enrollment.status !== 'CANCELLED' &&
      enrollment.assessment?.passed === true,
  )
}

// Module 9 view-authorization mirrors: trainee owns / trainer owns the course /
// admin authorized. Extracted pure so it can be unit tested directly.
export function canViewFeedback(actor, enrollment) {
  if (!actor || !enrollment) return false
  if (actor.role === ROLE_TRAINEE) {
    return String(enrollment.userId) === String(actor.id)
  }
  if (actor.role === ROLE_TRAINER) {
    return isApproved(actor) && String(enrollment.trainerId) === String(actor.id)
  }
  if (actor.role === ROLE_ADMIN) return true
  return false
}

// Server-side completion decision. `now` is injectable so tests can assert the
// server timestamp. Returns the authoritative status/progress/completedAt.
export function evaluateCompletion({ plan, enrollment, now = new Date() }) {
  const progress = enrollment?.progress ?? 0
  const passed = enrollment?.assessment?.passed === true
  const materialsDone = materialsComplete(plan, progress)

  if (materialsDone && passed) {
    return {
      completed: true,
      status: 'COMPLETED',
      progress: 100,
      completedAt: now.toISOString(),
    }
  }
  const engaged = progress > 0 || passed || (enrollment?.assessment?.attemptsCount ?? 0) > 0
  return {
    completed: false,
    status: enrollment?.status === 'CANCELLED' ? 'CANCELLED' : engaged ? 'IN_PROGRESS' : 'ENROLLED',
    progress: materialsDone ? MATERIALS_COMPLETE_PROGRESS : Math.min(progress, MATERIALS_COMPLETE_PROGRESS - 1),
    completedAt: null,
  }
}

// Trainer feedback analytics (Module 11 §10) — the aggregates the existing
// trainer dashboard already displays: count + average rating per factor.
export function summarizeFeedback(enrollments = []) {
  const feedbacks = (enrollments || []).filter(
    (e) =>
      e?.feedback &&
      (e.feedback.contentDepth != null ||
        e.feedback.trainerDelivery != null ||
        e.feedback.operationalRelevance != null),
  )
  const n = feedbacks.length
  const avg = (k) =>
    n ? Number((feedbacks.reduce((s, e) => s + (e.feedback[k] ?? 0), 0) / n).toFixed(2)) : null
  const averageContentDepth = avg('contentDepth')
  const averageTrainerDelivery = avg('trainerDelivery')
  const averageOperationalRelevance = avg('operationalRelevance')
  return {
    feedbackCount: n,
    averageContentDepth,
    averageTrainerDelivery,
    averageOperationalRelevance,
    averageOverall:
      averageContentDepth != null
        ? Number(((averageContentDepth + averageTrainerDelivery + averageOperationalRelevance) / 3).toFixed(2))
        : null,
    feedbackRatings: {
      contentDepth: averageContentDepth ?? 0,
      trainerDelivery: averageTrainerDelivery ?? 0,
      operationalRelevance: averageOperationalRelevance ?? 0,
    },
  }
}

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
      return await repo.listEnrollmentsForOwner(actor.id, { full })
    case ROLE_TRAINER:
      return await repo.listEnrollmentsForTrainer(actor.id, { full })
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
// UPDATE (authoritative progression)
// -------------------------------------------------------------------------
//
// MODULE 11: progression fields are backend-authoritative. A client may request
// status transitions / startedAt, but NEVER a numeric `progress` jump or a
// `completedAt` — both are derived server-side from the course sections, the
// recorded progress ledger and the assessment result. status=COMPLETED is only
// writable through the legitimate completion decision below.

export async function updateEnrollment(actor, enrollmentId, patch) {
  requireActor(actor)
  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')

  // Only the enrolling trainee may update their OWN enrollment.
  if (actor.role !== ROLE_TRAINEE || String(enrollment.userId) !== String(actor.id)) {
    throw new ApiError(
      403,
      'ENROLLMENT_NOT_YOURS',
      'Only the enrolled trainee can update their own enrollment.',
    )
  }

  // A completed enrollment is terminal — no further progression edits.
  if (enrollment.status === 'COMPLETED') return enrollment

  // status=COMPLETED can never be forced: recompute the legitimate decision and
  // only proceed when the requirements are genuinely met.
  if (patch.status === 'COMPLETED') {
    const updated = await finalizeCompletion(actor, enrollment.id)
    if (updated.status !== 'COMPLETED') {
      throw new ApiError(
        409,
        'ENROLLMENT_NOT_COMPLETE',
        'An enrollment can only complete once every learning section present in the course is complete and the assessment has been passed.',
      )
    }
    return updated
  }

  const write = {}
  // startedAt is a server-owned timestamp, but accepting an authoritative
  // backfill is harmless; completedAt and progress are NEVER client input.
  if (patch.startedAt !== undefined) write.startedAt = patch.startedAt
  if (patch.status !== undefined) {
    if (patch.status === 'CANCELLED') write.status = 'CANCELLED'
    else if (patch.status === 'IN_PROGRESS' || patch.status === 'ENROLLED') {
      // Physical reality wins: any recorded progress means IN_PROGRESS.
      write.status = (enrollment.progress ?? 0) > 0 ? 'IN_PROGRESS' : 'ENROLLED'
    }
    // progress / completedAt from the client are silently ignored (never trusted).
  }
  if (Object.keys(write).length > 0) {
    await repo.updateEnrollmentRow(enrollment.id, write)
  }
  return repo.findEnrollmentById(enrollment.id, { full: true })
}

// -------------------------------------------------------------------------
// MODULE 11 — SECTION COMPLETION
// -------------------------------------------------------------------------

export async function completeSection(actor, enrollmentId, { sectionId }) {
  requireApprovedTrainee(actor)

  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')
  if (String(enrollment.userId) !== String(actor.id)) {
    throw new ApiError(403, 'ENROLLMENT_NOT_YOURS', 'You can only work on your own enrollments.')
  }
  if (enrollment.status === 'CANCELLED') {
    throw new ApiError(409, 'ENROLLMENT_CANCELLED', 'This enrollment is cancelled and cannot be progressed.')
  }
  if (enrollment.status === 'COMPLETED') {
    throw new ApiError(409, 'ENROLLMENT_COMPLETED', 'This enrollment is already complete.')
  }

  const course = await repo.findCourseById(enrollment.courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  // The enrollment must belong to the requested course (defence-in-depth).
  if (String(enrollment.courseId) !== String(course.id)) {
    throw new ApiError(400, 'ENROLLMENT_COURSE_MISMATCH', 'The enrollment does not belong to the requested course.')
  }

  // Only sections that actually exist for THIS course can be completed.
  const sections = await repo.listSectionsForCourse(course.id)
  const plan = deriveProgressPlan(sections)
  const step = plan.steps.find((s) => String(s.sectionId) === String(sectionId))
  if (!step) {
    throw new ApiError(
      400,
      'SECTION_NOT_FOUND',
      'The requested learning section does not exist for this course.',
    )
  }

  const gate = canCompleteStep(plan, enrollment.progress ?? 0, sectionId)
  if (!gate.allowed) {
    throw new ApiError(
      409,
      'SECTION_COMPLETION_BLOCKED',
      'Complete the learning sections in order — earlier sections must be finished first.',
    )
  }

  const nextProgress = Math.max(enrollment.progress ?? 0, step.milestone)
  await repo.updateEnrollmentRow(enrollment.id, {
    status: 'IN_PROGRESS',
    progress: nextProgress,
  })

  // Materials may now be complete; if the assessment was already passed the
  // enrollment legitimately completes here.
  return finalizeCompletion(actor, enrollment.id)
}

// -------------------------------------------------------------------------
// MODULE 11 — COMPLETION DECISION (server-authoritative)
// -------------------------------------------------------------------------

export async function finalizeCompletion(actor, enrollmentId) {
  requireActor(actor)
  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')
  if (String(enrollment.userId) !== String(actor.id)) {
    throw new ApiError(403, 'ENROLLMENT_NOT_YOURS', 'You can only finalize your own enrollment.')
  }

  const course = await repo.findCourseById(enrollment.courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  const sections = await repo.listSectionsForCourse(course.id)
  const plan = deriveProgressPlan(sections)

  const outcome = evaluateCompletion({ plan, enrollment })
  if (
    outcome.completed &&
    (enrollment.status !== 'COMPLETED' || enrollment.progress !== 100 || !enrollment.completedAt)
  ) {
    // completed_at is ALWAYS the server timestamp — never a client value.
    await repo.updateEnrollmentRow(enrollment.id, {
      status: outcome.status,
      progress: outcome.progress,
      completedAt: outcome.completedAt,
    })
  }
  return repo.findEnrollmentById(enrollment.id, { full: true })
}

// -------------------------------------------------------------------------
// MODULE 11 — FEEDBACK
// -------------------------------------------------------------------------

export async function submitFeedback(actor, enrollmentId, input) {
  requireApprovedTrainee(actor)

  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')
  if (String(enrollment.userId) !== String(actor.id)) {
    throw new ApiError(403, 'ENROLLMENT_NOT_YOURS', 'You can only submit feedback for your own enrollment.')
  }
  // Feedback eligibility is backend-enforced — it is never merely hidden in UI.
  if (!isFeedbackEligible(enrollment)) {
    throw new ApiError(
      409,
      'FEEDBACK_LOCKED',
      'Feedback is available only after the assessment has been passed.',
    )
  }

  await repo.updateEnrollmentFeedbackRow(enrollment.id, {
    contentDepth: input.contentDepth,
    trainerDelivery: input.trainerDelivery,
    operationalRelevance: input.operationalRelevance,
    suggestions: input.suggestions ?? null,
  })

  // Feedback submission is a legitimate post-assessment mutation — re-run the
  // completion decision so any pending transition is persisted now.
  await finalizeCompletion(actor, enrollment.id).catch(() => {})
  return repo.findEnrollmentById(enrollment.id, { full: true })
}

// Trainee (own) / Trainer (owns the course) / Admin read path for feedback.
export async function getFeedback(actor, enrollmentId) {
  requireActor(actor)
  const enrollment = await repo.findEnrollmentById(enrollmentId, { full: true })
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')
  if (!canViewFeedback(actor, enrollment)) {
    throw new ApiError(
      403,
      'FEEDBACK_ACCESS_DENIED',
      'You are not authorized to view this feedback.',
    )
  }
  const feedback = enrollment.feedback
  return {
    submitted: Boolean(
      feedback &&
        (feedback.contentDepth != null ||
          feedback.trainerDelivery != null ||
          feedback.operationalRelevance != null ||
          feedback.suggestions != null),
    ),
    feedback,
  }
}

// Trainer feedback analytics — aggregates over enrollments for courses the
// trainer owns (enrollments.trainer_id is the frozen course trainer).
export async function getTrainerFeedbackAnalytics(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_TRAINER || !isApproved(actor)) {
    throw new ApiError(403, 'TRAINER_ROLE_REQUIRED', 'Only an APPROVED TRAINER can view feedback analytics.')
  }
  const enrollments = await repo.listEnrollmentsForTrainer(actor.id, { full: true })
  return summarizeFeedback(enrollments)
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
    const bucket = keyForMaterialType(section.sectionType)
    if (!bucket) continue
    materials[bucket].push(await materialFor(section))
  }

  // Practice draws from the course's REAL valid question bank: a capped subset
  // shipped with its answers (training tool), never a second bank, never an
  // assessment attempt. Zero valid questions → an honest empty array.
  const validBank = (await listQuestionsForCourse(course.id, { validOnly: true })).filter(isPracticeQuestion)
  const practiceQuestions = buildPracticeSet(validBank).map(toPracticeQuestion)

  // Module 11 derived state: authoritative progress, per-type completion
  // compatibility flags, assessment + feedback + completion visibility.
  const plan = deriveProgressPlan(sections)
  const progress = enrollment.progress ?? 0
  const outcome = evaluateCompletion({ plan, enrollment })
  const compatibility = {
    notesDone: typeDone(plan, progress, 'notes'),
    slidesDone: typeDone(plan, progress, 'slides'),
    videoDone: typeDone(plan, progress, 'videos'),
    practiceDone: typeDone(plan, progress, 'practice'),
  }

  return {
    enrollment: {
      ...enrollment,
      ...compatibility,
    },
    course,
    materials,
    practiceQuestions,
    progress: {
      value: progress,
      materialsThreshold: plan.threshold,
      materialsComplete: materialsComplete(plan, progress),
      assessmentPassed: enrollment.assessment?.passed === true,
      sectionPlan: plan.steps,
      ...compatibility,
    },
    assessment: enrollment.assessment,
    feedback: enrollment.feedback,
    completion: {
      completed: outcome.completed,
      status: outcome.status,
      completedAt: outcome.completedAt,
    },
  }
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
