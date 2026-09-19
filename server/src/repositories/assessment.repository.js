// MODULE 10 — ASSESSMENT REPOSITORY
//
// Single authority for `assessment_attempts` reads/writes + the Module 10
// enrollment assessment-summary update on `enrollments`. Mirrors the Module 9
// repository conventions exactly (supabaseAdmin, column-select constants,
// row mappers, operation-scoped ApiError triage, no transactions).
//
// FROZEN SCHEMA (authoritative — never altered):
//   public.assessment_attempts:
//     id, enrollment_id, user_id, course_id, questions_snapshot (JSONB),
//     answers (JSONB), correct_count, incorrect_count, unattempted_count,
//     raw_score NUMERIC(6,2), percentage NUMERIC(5,2), passed,
//     time_spent_seconds, attempted_at, created_at
//   NOTE: the Module 10 spec §3 lists easy_count/medium_count/hard_count but the
//   frozen migration does NOT define them — that data is therefore carried in the
//   JSONB questions_snapshot (distribution) instead. No schema change is made.
//
// The enrollment update touches ONLY the frozen assessment columns:
//   assessment_attempts_count, assessment_score, assessment_percentage,
//   assessment_passed.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

export const ATTEMPT_COLUMNS = [
  'id',
  'enrollment_id',
  'user_id',
  'course_id',
  'questions_snapshot',
  'answers',
  'correct_count',
  'incorrect_count',
  'unattempted_count',
  'raw_score',
  'percentage',
  'passed',
  'time_spent_seconds',
  'attempted_at',
  'created_at',
].join(', ')

export function mapAttemptRow(row) {
  if (!row) return null
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    userId: row.user_id,
    courseId: row.course_id,
    questionsSnapshot: row.questions_snapshot,
    answers: row.answers,
    correctCount: row.correct_count ?? 0,
    incorrectCount: row.incorrect_count ?? 0,
    unattemptedCount: row.unattempted_count ?? 0,
    rawScore: row.raw_score ?? null,
    percentage: row.percentage ?? null,
    passed: row.passed ?? null,
    timeSpentSeconds: row.time_spent_seconds ?? null,
    attemptedAt: row.attempted_at ?? null,
    createdAt: row.created_at ?? null,
  }
}

// Maps attempts to the PUBLIC (trainee-safe) shape. Question text/options are
// surfaced only for the questions the trainee already answered; correctOptionIndex
// is ALWAYS stripped so an answer key can never leak through attempt history.
export function mapAttemptRowPublic(row) {
  if (!row) return null
  const attempt = mapAttemptRow(row)
  const snapshot = attempt.questionsSnapshot || {}
  const questions = Array.isArray(snapshot.questions)
    ? snapshot.questions.map((q) => ({
        id: q.id,
        text: q.text,
        difficulty: q.difficulty,
        topic: q.topic ?? null,
        tagLabel: q.tagLabel ?? null,
        questionType: q.questionType ?? 'MCQ',
      }))
    : []
  return {
    id: attempt.id,
    enrollmentId: attempt.enrollmentId,
    courseId: attempt.courseId,
    distribution: snapshot.distribution || null,
    total: questions.length,
    questions,
    correctCount: attempt.correctCount,
    incorrectCount: attempt.incorrectCount,
    unattemptedCount: attempt.unattemptedCount,
    rawScore: attempt.rawScore,
    percentage: attempt.percentage,
    passed: attempt.passed,
    timeSpentSeconds: attempt.timeSpentSeconds,
    attemptedAt: attempt.attemptedAt,
    createdAt: attempt.createdAt,
  }
}

// ---------------------------------------------------------------------------
// ERROR TRIAGE (same shape as Module 9's repository error mapping)
// ---------------------------------------------------------------------------

function asAssessmentError(operation, error) {
  const code = error?.code
  const name = {
    create: 'ATTEMPT_CREATE',
    lookup: 'ATTEMPT_LOOKUP',
    submit: 'ATTEMPT_SUBMIT',
    list: 'ATTEMPT_LIST',
    revert: 'ATTEMPT_REVERT',
    summary: 'ENROLLMENT_SUMMARY',
  }[operation] || 'ATTEMPT'
  if (code === '42P01') {
    return new ApiError(503, `${name}_UNAVAILABLE`, 'The assessment data source is unavailable.', {
      dbCode: code,
      dbMessage: error.message,
    })
  }
  if (code === '23503') {
    return new ApiError(400, `${name}_BAD_REFERENCE`, 'The assessment references an unknown record.', {
      dbCode: code,
      dbMessage: error.message,
    })
  }
  if (code === '23514' || code === '22P02' || code === '23502') {
    return new ApiError(400, `${name}_INVALID_DATA`, 'The assessment data is invalid.', {
      dbCode: code,
      dbMessage: error.message,
    })
  }
  return new ApiError(500, `${name}_UNEXPECTED`, 'The assessment could not be processed.', {
    dbCode: code,
    dbMessage: error.message,
  })
}

// ---------------------------------------------------------------------------
// ATTEMPTS
// ---------------------------------------------------------------------------

export async function findAttemptById(id) {
  const { data, error } = await supabaseAdmin
    .from('assessment_attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw asAssessmentError('lookup', error)
  return mapAttemptRow(data)
}

// Creates the attempt row at START. The submitted fields stay NULL until the
// attempt is actually submitted (attempted_at IS NULL marks "pending") so a
// duplicate SUBMIT is impossible to confuse with a brand-new attempt.
export async function createAttemptRow(input) {
  const { data, error } = await supabaseAdmin
    .from('assessment_attempts')
    .insert({
      enrollment_id: input.enrollmentId,
      user_id: input.userId,
      course_id: input.courseId,
      questions_snapshot: input.snapshot,
      answers: null,
    })
    .select(ATTEMPT_COLUMNS)
    .single()
  if (error) throw asAssessmentError('create', error)
  return mapAttemptRow(data)
}

// Idempotence guard lives in the WHERE clause: only a row whose attempted_at is
// still NULL can be submitted. Returns null when the attempt was already
// submitted (or does not exist) so the service can answer with a clean 409.
export async function submitAttemptRow(id, update) {
  const { data, error } = await supabaseAdmin
    .from('assessment_attempts')
    .update(update)
    .eq('id', id)
    .is('attempted_at', null)
    .select(ATTEMPT_COLUMNS)
    .maybeSingle()
  if (error) throw asAssessmentError('submit', error)
  return mapAttemptRow(data)
}

export async function countSubmittedAttemptsForEnrollment(enrollmentId) {
  const { count, error } = await supabaseAdmin
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('enrollment_id', enrollmentId)
    .not('attempted_at', 'is', null)
  if (error) throw asAssessmentError('list', error)
  return count ?? 0
}

export async function listAttemptsForEnrollment(enrollmentId, { limit = 100, offset = 0 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('assessment_attempts')
    .select(ATTEMPT_COLUMNS, { count: 'exact' })
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw asAssessmentError('list', error)
  return { attempts: (data || []).map(mapAttemptRow), total: count ?? 0 }
}

// Compensation for the two-step submit (attempt → enrollment summary): if the
// enrollment summary update fails after the attempt is submitted, the attempt is
// returned to its pending state so the enrollment is never left misleading.
export async function revertToPendingAttempt(id) {
  const { data, error } = await supabaseAdmin
    .from('assessment_attempts')
    .update({
      answers: null,
      correct_count: 0,
      incorrect_count: 0,
      unattempted_count: 0,
      raw_score: null,
      percentage: null,
      passed: null,
      time_spent_seconds: null,
      attempted_at: null,
    })
    .eq('id', id)
    .select(ATTEMPT_COLUMNS)
    .maybeSingle()
  if (error) throw asAssessmentError('revert', error)
  return mapAttemptRow(data)
}

// ---------------------------------------------------------------------------
// ENROLLMENT ASSESSMENT SUMMARY (Module 10 scope only — the four frozen columns)
// ---------------------------------------------------------------------------

export async function updateEnrollmentAssessmentSummary(enrollmentId, summary) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .update({
      assessment_attempts_count: summary.attemptsCount,
      assessment_score: summary.score,
      assessment_percentage: summary.percentage,
      assessment_passed: summary.passed,
    })
    .eq('id', enrollmentId)
    .select('id, assessment_attempts_count, assessment_score, assessment_percentage, assessment_passed')
    .maybeSingle()
  if (error) throw asAssessmentError('summary', error)
  if (!data) return null
  return {
    attemptsCount: data.assessment_attempts_count,
    score: data.assessment_score,
    percentage: data.assessment_percentage,
    passed: data.assessment_passed,
  }
}