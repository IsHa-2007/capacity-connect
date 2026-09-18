// MODULE 9 — ENROLLMENT REPOSITORY (Supabase / PostgreSQL)
//
// Thin data-access layer over the FROZEN Module contract. It reads/writes only
// the public.enrollments relation (plus public.courses / public.course_sections
// for workspace joins) and NEVER invents columns, timestamps, or statuses. All
// RBAC/ownership rules live in the enrollment SERVICE — this repository is
// deliberately auth-agnostic, exactly like course.repository.js.
//
// Frozen column contract (do not drift from the migration):
//   enrollments:  id, user_id, course_id, trainer_id, status, progress,
//                 started_at, completed_at,
//                 assessment_attempts_count, assessment_score,
//                 assessment_percentage, assessment_passed,
//                 feedback_content_depth, feedback_trainer_delivery,
//                 feedback_operational_relevance, feedback_suggestions,
//                 created_at, updated_at
//   UNIQUE(user_id, course_id)  — enforced by the DB, surfaced as 409 here.
//
// NOTE: the assessment / feedback / certificate columns are FROZEN but their
// business logic belongs to later modules (10, 11, 12). This repository passes
// them through read-only (mapEnrollmentRow) and NEVER writes them.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'
import { ENROLLMENT_STATUSES } from '../validators/enrollment.validator.js'

export const ENROLLMENTS_BASE = `
  id, user_id, course_id, trainer_id, status, progress,
  started_at, completed_at, created_at, updated_at
`

export const ENROLLMENTS_FULL = `
  id, user_id, course_id, trainer_id, status, progress,
  started_at, completed_at,
  assessment_attempts_count, assessment_score, assessment_percentage, assessment_passed,
  feedback_content_depth, feedback_trainer_delivery, feedback_operational_relevance, feedback_suggestions,
  created_at, updated_at
`

// ---------------------------------------------------------------------------
// ROW MAPPERS (snake_case DB → camelCase API, mirroring toProfile)
// ---------------------------------------------------------------------------

export function mapEnrollmentRow(row, { full = false } = {}) {
  if (!row) return null
  const out = {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    trainerId: row.trainer_id,
    status: row.status,
    progress: row.progress ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (full) {
    out.assessment = {
      attemptsCount: row.assessment_attempts_count ?? 0,
      score: row.assessment_score ?? null,
      percentage: row.assessment_percentage ?? null,
      passed: row.assessment_passed ?? null,
    }
    out.feedback = {
      contentDepth: row.feedback_content_depth ?? null,
      trainerDelivery: row.feedback_trainer_delivery ?? null,
      operationalRelevance: row.feedback_operational_relevance ?? null,
      suggestions: row.feedback_suggestions ?? null,
    }
  }
  return out
}

export function mapCourseRow(row) {
  if (!row) return null
  return {
    id: row.id,
    trainerId: row.trainer_id,
    title: row.title,
    domain: row.domain,
    description: row.description,
    difficulty: row.difficulty,
    duration: row.duration,
    objectives: Array.isArray(row.objectives) ? row.objectives : [],
    syllabus: Array.isArray(row.syllabus) ? row.syllabus : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  }
}

export function mapSectionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    sectionType: row.section_type,
    orderIndex: row.order_index,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
  }
}

// ---------------------------------------------------------------------------
// ERROR MAPPING (mirrors course.repository error triage)
// ---------------------------------------------------------------------------

function asEnrollmentError(operation, error) {
  const base = `ENROLLMENT_${String(operation).toUpperCase()}`
  const code = error?.code

  if (code === '42P01' || /relation .*enrollments.*does not exist/i.test(error?.message || '')) {
    return new ApiError(503, `${base}_UNAVAILABLE`, 'The enrollment storage is not ready yet.', { dbCode: code })
  }
  if (code === '23505') {
    return new ApiError(409, 'ALREADY_ENROLLED', 'You are already enrolled in this course.', { dbCode: code })
  }
  if (code === '23503') {
    return new ApiError(400, 'ENROLLMENT_BAD_REFERENCE', 'The referenced course/trainer does not exist.', { dbCode: code })
  }
  if (code === '23514' || code === '22P02') {
    return new ApiError(400, 'ENROLLMENT_INVALID_DATA', 'The enrollment data violates the schema constraints.', {
      dbCode: code,
      dbMessage: error?.message,
    })
  }
  return new ApiError(500, `${base}_UNEXPECTED`, 'The enrollment operation could not be completed.', {
    dbCode: code,
    dbMessage: error?.message,
  })
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function findEnrollmentById(id, { full = false } = {}) {
  const builder = supabaseAdmin
    .from('enrollments')
    .select(full ? ENROLLMENTS_FULL : ENROLLMENTS_BASE)
    .eq('id', id)
  const { data, error } = await builder.maybeSingle()
  if (error) throw asEnrollmentError('lookup', error)
  return mapEnrollmentRow(data, { full })
}

export async function findEnrollmentForUserAndCourse(userId, courseId) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select(ENROLLMENTS_BASE)
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()
  if (error) throw asEnrollmentError('lookup', error)
  return mapEnrollmentRow(data)
}

export async function listEnrollmentsForOwner(userId, { full = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select(full ? ENROLLMENTS_FULL : ENROLLMENTS_BASE)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw asEnrollmentError('list', error)
  return (data || []).map((r) => mapEnrollmentRow(r, { full }))
}

export async function listEnrollmentsForTrainer(trainerId, { full = false } = {}) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select(full ? ENROLLMENTS_FULL : ENROLLMENTS_BASE)
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })
  if (error) throw asEnrollmentError('list', error)
  return (data || []).map((r) => mapEnrollmentRow(r, { full }))
}

export async function listEnrollmentsAdmin({ full = false, limit = 200, offset = 0 } = {}) {
  let builder = supabaseAdmin.from('enrollments').select(full ? ENROLLMENTS_FULL : ENROLLMENTS_BASE, { count: 'exact' })
  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw asEnrollmentError('list', error)
  return { enrollments: (data || []).map((r) => mapEnrollmentRow(r, { full })), total: count ?? 0 }
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------

export async function createEnrollmentRow(input) {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      trainer_id: input.trainerId,
      status: 'ENROLLED',
      progress: 0,
      started_at: new Date().toISOString(),
    })
    .select(ENROLLMENTS_BASE)
    .single()
  if (error) throw asEnrollmentError('create', error)
  return mapEnrollmentRow(data)
}

export async function updateEnrollmentRow(id, patch) {
  const out = {}
  // STRICT whitelist — only legitimate frozen progression fields are writable.
  // user_id / course_id / trainer_id can NEVER be patched here (the validator
  // already rejects them; this is the second line of defense).
  if (patch.status !== undefined) out.status = patch.status
  if (patch.progress !== undefined) out.progress = patch.progress
  if (patch.startedAt !== undefined) out.started_at = patch.startedAt
  if (patch.completedAt !== undefined) out.completed_at = patch.completedAt
  if (Object.keys(out).length === 0) return null

  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .update(out)
    .eq('id', id)
    .select(ENROLLMENTS_BASE)
    .maybeSingle()
  if (error) throw asEnrollmentError('update', error)
  return mapEnrollmentRow(data)
}

// ---------------------------------------------------------------------------
// WORKSPACE BUILD BLOCKS
// ---------------------------------------------------------------------------

export async function findCourseById(courseId) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('id, trainer_id, title, domain, description, difficulty, duration, objectives, syllabus, tags, status, is_featured, created_at, updated_at, published_at')
    .eq('id', courseId)
    .maybeSingle()
  if (error) throw asEnrollmentError('course:lookup', error)
  return mapCourseRow(data)
}

export async function listSectionsForCourse(courseId) {
  const { data, error } = await supabaseAdmin
    .from('course_sections')
    .select('id, course_id, section_type, order_index, storage_bucket, storage_path, mime_type, file_size, original_filename')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
  if (error) throw asEnrollmentError('sections:list', error)
  return (data || []).map(mapSectionRow)
}
