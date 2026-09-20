// MODULE 10 — ASSESSMENT SERVICE
//
// The single authority for every Module 10 assessment rule (mirrors Modules 8/9:
// course.service / enrollment.service are the templates). Owns:
//   * RBAC         only an APPROVED TRAINEE can start/submit an assessment, and
//                  only against an enrollment that belongs to them, on a course
//                  that is PUBLISHED. Attempt history is readable by the owning
//                  trainee, the owning trainer (approved), and admins.
//   * NC-trust     the question set, snapshot, scoring inputs, score, percentage
//                  and pass/fail are computed HERE. A client can never supply
//                  correct/incorrect counts, raw score, percentage or passed.
//   * Distribution the assessment is generated server-side using the frozen
//                  20/30/50 EASY/MEDIUM/HARD split over a documented constant
//                  size (20 — matches the existing app's examGenerator default).
//   * Snapshot     at START the exact question set (incl. correct answers) is
//                  frozen into assessment_attempts.questions_snapshot; SUBMIT
//                  scores against that snapshot, never against live bank rows.
//
// Constants are exported so tests can exercise the pure helpers (distribution,
// eligibility, scoring) without touching a database.

// MODULE 19 (PHASE 1) — TRAINER-CONFIGURABLE ASSESSMENT DURATION
// The assessment time limit is NO LONGER a single hardcoded constant. It is a
// per-course persisted value (courses.assessment_duration_minutes) configured by
// the authorized trainer/course owner and owned here:
//   * The backend is authoritative for the duration — startAssessment resolves
//     the SAME course value every attempt, never a client-supplied number.
//   * Existing/legacy courses default to the product default (20 minutes), both
//     by the additive migration's DEFAULT 20 and by the runtime fallback below.
//   * Bounds (5..180 minutes) are enforced by the zod validator, the DB CHECK,
//     and the exported constants so every layer agrees.

import { ApiError } from '../utils/apiResponse.js'
import * as assessmentRepo from '../repositories/assessment.repository.js'
import * as enrollmentRepo from '../repositories/enrollment.repository.js'
import { findCourseById, listQuestionsForCourse } from '../repositories/course.repository.js'
import { ROLE_TRAINEE, ROLE_TRAINER, ROLE_ADMIN, isApproved } from '../lib/roles.js'
import { finalizeCompletion as finalizeEnrollmentCompletion } from './enrollment.service.js'

// Existing product definition (src/utils/examGenerator.js): assessment size,
// time limit, negative marking and pass threshold are reused verbatim, not
// reinvented. 20 questions → 20% easy (4) / 30% medium (6) / 50% hard (10).
export const ASSESSMENT_QUESTION_COUNT = 20
// MODULE 19: the product default duration remains a documented constant; the
// runtime limit is the owning course's per-course value (see
// resolveAssessmentTimeLimitSeconds below).
export const DEFAULT_ASSESSMENT_DURATION_MINUTES = 20
export const ASSESSMENT_DURATION_MIN_MINUTES = 5
export const ASSESSMENT_DURATION_MAX_MINUTES = 180
export const ASSESSMENT_TIME_LIMIT_SECONDS = DEFAULT_ASSESSMENT_DURATION_MINUTES * 60 // 20 minutes (product default)
export const NEGATIVE_MARKING = 0.25
export const ASSESSMENT_PASS_PERCENTAGE = 75
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD']

// Resolves the assessment time limit for a course attempt. The backend is
// authoritative: this returns the course's persisted duration in minutes
// (courses.assessment_duration_minutes), falling back to the 20-minute product
// default only when the row predates the Module 19 migration / has a NULL value.
// minutes is bounded (5..180) at every layer; * 60 is the documented conversion.
export function resolveAssessmentTimeLimitSeconds(course) {
  const minutes = course?.assessmentDurationMinutes ?? DEFAULT_ASSESSMENT_DURATION_MINUTES
  return minutes * 60
}

// Deterministic 20/30/50 split for a target size. Rounding matches the existing
// generator (round() on easy/medium, remainder to hard) so the counts always
// sum back to `total`.
export function assessmentDistribution(total = ASSESSMENT_QUESTION_COUNT) {
  const easy = Math.round(total * 0.2)
  const medium = Math.round(total * 0.3)
  const hard = total - easy - medium
  return { easy, medium, hard }
}

// An assessment-eligible question must be structurally valid (§6) AND marked
// valid in the bank (is_valid TRUE). The repository already filters is_valid;
// this is the defense-in-depth structural check applied before selection.
export function isQuestionEligible(q) {
  if (!q) return false
  if (!q.is_valid && q.isValid !== true) return false
  if (typeof q.text !== 'string' || !q.text.trim()) return false
  if (q.questionType && q.questionType !== 'MCQ') return false
  if (!Array.isArray(q.options) || q.options.length < 2) return false
  const idx = q.correctOptionIndex
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return false
  return DIFFICULTIES.includes(q.difficulty)
}

// Fisher–Yates shuffle (server-side randomization).
function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Pure scoring against a frozen snapshot. `answers` is a map of
// questionId → optionIndex (null/absent = unattempted). Returns the exact
// Module 10 maths: +1 correct, −0.25 incorrect, 0 unattempted, percentage over
// the maximum possible score, passed ⇔ percentage >= 75.
export function scoreSnapshot(snapshotQuestions, answerMap) {
  let correct = 0
  let incorrect = 0
  let unattempted = 0
  let raw = 0

  for (const q of snapshotQuestions || []) {
    const given = answerMap?.[q.id]
    if (given === null || given === undefined) {
      unattempted++
      continue
    }
    if (given === q.correctOptionIndex) {
      correct++
      raw += 1
    } else {
      incorrect++
      raw -= NEGATIVE_MARKING
    }
  }

  const maxScore = (snapshotQuestions || []).length
  const rawScore = Number(raw.toFixed(2))
  const percentage = maxScore > 0 ? Math.max(0, Number(((raw / maxScore) * 100).toFixed(2))) : 0
  const passed = percentage >= ASSESSMENT_PASS_PERCENTAGE

  return { correct, incorrect, unattempted, rawScore, percentage, passed, maxScore }
}

// ---------------------------------------------------------------------------
// RBAC HELPERS (same conventions as Modules 8/9)
// ---------------------------------------------------------------------------

function requireActor(actor) {
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.')
}

function requireApprovedTrainee(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_TRAINEE || !isApproved(actor)) {
    throw new ApiError(
      403,
      'TRAINEE_ROLE_REQUIRED',
      'Only an APPROVED TRAINEE can take an assessment.',
    )
  }
}

// ---------------------------------------------------------------------------
// ASSESSMENT START
// ---------------------------------------------------------------------------

export async function startAssessment(actor, enrollmentId) {
  requireApprovedTrainee(actor)

  const enrollment = await enrollmentRepo.findEnrollmentById(enrollmentId)
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')

  // The enrollment must belong to the authenticated trainee.
  if (String(enrollment.userId) !== String(actor.id)) {
    throw new ApiError(403, 'ENROLLMENT_NOT_YOURS', 'You can only take assessments for your own enrollments.')
  }

  const course = await findCourseById(enrollment.courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  if (course.status !== 'PUBLISHED') {
    throw new ApiError(409, 'COURSE_NOT_PUBLISHED', 'Assessment is only available for PUBLISHED courses.')
  }

  // Whole valid question bank (repository filters is_valid; we re-verify shape).
  const bank = (await listQuestionsForCourse(course.id, { validOnly: true })).filter(isQuestionEligible)

  const distribution = assessmentDistribution(ASSESSMENT_QUESTION_COUNT)
  const pools = {
    EASY: bank.filter((q) => q.difficulty === 'EASY'),
    MEDIUM: bank.filter((q) => q.difficulty === 'MEDIUM'),
    HARD: bank.filter((q) => q.difficulty === 'HARD'),
  }

  // Insufficient bank → clean server error; never silently shrink the exam.
  for (const difficulty of DIFFICULTIES) {
    const required = distribution[difficulty.toLowerCase()]
    if (pools[difficulty].length < required) {
      throw new ApiError(
        409,
        'QUESTION_BANK_INSUFFICIENT',
        `The course question bank is insufficient for an assessment: needs ${required} ${difficulty} ` +
          `question(s) but only has ${pools[difficulty].length}. ` +
          'Add more valid questions before starting the assessment.',
      )
    }
  }

  // Randomize per-difficulty selection, then randomize overall order.
  const selected = shuffle([
    ...shuffle(pools.EASY).slice(0, distribution.easy),
    ...shuffle(pools.MEDIUM).slice(0, distribution.medium),
    ...shuffle(pools.HARD).slice(0, distribution.hard),
  ])

  // Freeze the exact question set (correctOptionIndex included) at START so a
  // later bank edit can never change what this attempt is scored against.
  const snapshotQuestions = selected.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    difficulty: q.difficulty,
    topic: q.topic ?? null,
    tagLabel: q.tagLabel ?? null,
    questionType: 'MCQ',
    correctOptionIndex: q.correctOptionIndex,
  }))
  const snapshot = {
    version: 1,
    distribution,
    questions: snapshotQuestions,
  }

  const attempt = await assessmentRepo.createAttemptRow({
    enrollmentId: enrollment.id,
    userId: actor.id,
    courseId: course.id,
    snapshot,
  })

  return {
    attemptId: attempt.id,
    enrollmentId: attempt.enrollmentId,
    courseId: attempt.courseId,
    distribution,
    timeLimitSeconds: resolveAssessmentTimeLimitSeconds(course),
    questions: snapshotQuestions.map(({ id, text, options, difficulty, topic, tagLabel, questionType }) => ({
      id,
      text,
      options,
      difficulty,
      topic,
      tagLabel,
      questionType,
    })),
  }
}

// ---------------------------------------------------------------------------
// ATTEMPT SUBMISSION
// ---------------------------------------------------------------------------

export async function submitAssessment(actor, enrollmentId, attemptId, input) {
  requireApprovedTrainee(actor)

  const attempt = await assessmentRepo.findAttemptById(attemptId)
  if (!attempt || String(attempt.enrollmentId) !== String(enrollmentId)) {
    throw new ApiError(404, 'ATTEMPT_NOT_FOUND', 'The assessment attempt could not be found.')
  }
  if (String(attempt.userId) !== String(actor.id)) {
    throw new ApiError(403, 'ATTEMPT_NOT_YOURS', 'You can only submit your own assessment attempts.')
  }

  // Re-submission guard: only an unsubmitted (attempted_at IS NULL) attempt may
  // be accepted. The repository re-checks this atomically too.
  if (attempt.attemptedAt !== null) {
    throw new ApiError(409, 'ATTEMPT_ALREADY_SUBMITTED', 'This assessment attempt has already been submitted.')
  }

  const snapshot = attempt.questionsSnapshot || {}
  const snapshotQuestions = Array.isArray(snapshot.questions) ? snapshot.questions : []
  const validIds = new Set(snapshotQuestions.map((q) => q.id))

  // Build the answer map. optionIndex is validated against the SNAPSHOT option
  // count, and every questionId must belong to THIS attempt's frozen question set.
  const answerMap = {}
  for (const answer of input.answers || []) {
    if (!validIds.has(answer.questionId)) {
      throw new ApiError(
        400,
        'ATTEMPT_UNKNOWN_QUESTION',
        `Question ${answer.questionId} is not part of this assessment attempt.`,
      )
    }
    const question = snapshotQuestions.find((q) => q.id === answer.questionId)
    if (
      answer.optionIndex === null ||
      answer.optionIndex === undefined ||
      answer.optionIndex < 0 ||
      answer.optionIndex >= question.options.length
    ) {
      throw new ApiError(
        400,
        'ATTEMPT_INVALID_OPTION',
        `optionIndex for question ${answer.questionId} is out of range.`,
      )
    }
    answerMap[answer.questionId] = answer.optionIndex
  }

  const result = scoreSnapshot(snapshotQuestions, answerMap)

  // Atomic submit: WHERE attempted_at IS NULL means a concurrent double-submit
  // is rejected by the database, not just the service check above.
  const submitted = await assessmentRepo.submitAttemptRow(attempt.id, {
    answers: input.answers && input.answers.length ? input.answers : [],
    correct_count: result.correct,
    incorrect_count: result.incorrect,
    unattempted_count: result.unattempted,
    raw_score: result.rawScore,
    percentage: result.percentage,
    passed: result.passed,
    time_spent_seconds: input.timeSpentSeconds ?? null,
    attempted_at: new Date().toISOString(),
  })
  if (!submitted) {
    throw new ApiError(409, 'ATTEMPT_ALREADY_SUBMITTED', 'This assessment attempt has already been submitted.')
  }

  // Update the enrollment assessment summary from the LATEST attempt's values.
  const attemptsCount = await assessmentRepo.countSubmittedAttemptsForEnrollment(enrollmentId)

  let enrollmentSummary
  try {
    enrollmentSummary = await assessmentRepo.updateEnrollmentAssessmentSummary(enrollmentId, {
      attemptsCount,
      score: submitted.rawScore,
      percentage: submitted.percentage,
      passed: submitted.passed,
    })
  } catch (summaryError) {
    // Consistency (spec §24): never leave the enrollment with a misleading
    // result when the summary write fails — compensate by reverting the attempt
    // to its pending state, then surface the original error.
    try {
      await assessmentRepo.revertToPendingAttempt(attempt.id)
    } catch {
      /* best-effort compensation; the error below is the one the client sees */
    }
    throw summaryError
  }

  // MODULE 11 INTEGRATION: after a passed attempt persists, let the enrollment
  // service re-run its authoritative completion decision. If the materials were
  // already complete the enrollment legitimately turns COMPLETED right now —
  // never at a client-supplied timestamp, always at the server's. Best effort:
  // an attempt already succeeded; a completion write failure must not fail it.
  let finalizedEnrollment = enrollmentSummary
  try {
    const finalized = await finalizeEnrollmentCompletion(actor, enrollmentId)
    if (finalized) finalizedEnrollment = finalized
  } catch {
    // best-effort — never fail a successful attempt because completion write erred
  }

  return {
    attempt: {
      id: submitted.id,
      enrollmentId: submitted.enrollmentId,
      courseId: submitted.courseId,
      correctCount: submitted.correctCount,
      incorrectCount: submitted.incorrectCount,
      unattemptedCount: submitted.unattemptedCount,
      rawScore: submitted.rawScore,
      percentage: submitted.percentage,
      passed: submitted.passed,
      timeSpentSeconds: submitted.timeSpentSeconds,
      attemptedAt: submitted.attemptedAt,
      createdAt: submitted.createdAt,
    },
    enrollment: finalizedEnrollment,
  }
}

// ---------------------------------------------------------------------------
// ATTEMPT HISTORY
// ---------------------------------------------------------------------------

export async function listAttempts(actor, enrollmentId) {
  requireActor(actor)

  const enrollment = await enrollmentRepo.findEnrollmentById(enrollmentId)
  if (!enrollment) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'The enrollment could not be found.')

  let authorized = false
  if (actor.role === ROLE_TRAINEE) {
    if (!isApproved(actor)) throw new ApiError(403, 'TRAINEE_ROLE_REQUIRED', 'Your account must be approved.')
    authorized = String(enrollment.userId) === String(actor.id)
  } else if (actor.role === ROLE_TRAINER) {
    if (!isApproved(actor)) throw new ApiError(403, 'TRAINER_ROLE_REQUIRED', 'Your account must be approved.')
    const course = await findCourseById(enrollment.courseId)
    authorized = Boolean(course && String(course.trainerId) === String(actor.id))
  } else if (actor.role === ROLE_ADMIN) {
    authorized = true
  }

  if (!authorized) {
    throw new ApiError(
      403,
      'ATTEMPT_HISTORY_FORBIDDEN',
      'You are not authorized to view these assessment attempts.',
    )
  }

  const { attempts } = await assessmentRepo.listAttemptsForEnrollment(enrollmentId)
  // Correct answers are stripped here (snapshot correctOptionIndex removed).
  return attempts.map(assessmentRepo.mapAttemptRowPublic)
}