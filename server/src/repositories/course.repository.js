// Module 8 — COURSE & QUESTION-BANK REPOSITORY (Supabase / PostgreSQL)
//
// Thin data-access layer over the FROZEN Module 5 schema. It only reads/writes
// the public.courses, public.course_sections and public.questions relations and
// never invents columns or timestamps. All ownership/authorization rules live in
// the course SERVICE (the repository is deliberately auth-agnostic).
//
// Frozen column contract (do not drift from the migration):
//   courses:                  id, trainer_id, title, domain, description,
//                             difficulty, duration, objectives[], syllabus[],
//                             tags[], status, is_featured, search_vector,
//                             assessment_duration_minutes (Module 19, additive),
//                             created_at, updated_at, published_at
//   course_sections:          id, course_id, section_type, order_index, title,
//                             storage_bucket, storage_path, mime_type,
//                             file_size, original_filename, legacy_storage_path,
//                             created_at
//   questions:                id, course_id, difficulty, text, topic, options,
//                             correct_option_index, tag_label, question_type,
//                             is_valid, created_at

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

const COURSES_BASE = `
  id, trainer_id, title, domain, description, difficulty, duration,
  objectives, syllabus, tags, status, is_featured,
  assessment_duration_minutes, created_at, updated_at, published_at
`

function mapCourseRow(row) {
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
    assessmentDurationMinutes: row.assessment_duration_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    // Aggregate/decorated fields are NEVER stored; they are added by the service
    // layer via course_stats. Keep this mapper column-exact.
  }
}

function mapSectionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    sectionType: row.section_type,
    orderIndex: row.order_index,
    title: row.title,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
    legacyStoragePath: row.legacy_storage_path,
    createdAt: row.created_at,
  }
}

function mapQuestionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    difficulty: row.difficulty,
    text: row.text,
    topic: row.topic,
    options: Array.isArray(row.options) ? row.options : [],
    correctOptionIndex: row.correct_option_index,
    tagLabel: row.tag_label,
    questionType: row.question_type,
    is_valid: row.is_valid,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// COURSES
// ---------------------------------------------------------------------------

export async function findCourseById(id) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select(COURSES_BASE)
    .eq('id', id)
    .maybeSingle()
  if (error) throw asCourseError('lookup', error)
  return mapCourseRow(data)
}

export async function listCourses({ status, trainerId, featured, limit = 200, offset = 0 } = {}) {
  let builder = supabaseAdmin.from('courses').select(COURSES_BASE, { count: 'exact' })
  if (status) builder = builder.eq('status', status)
  if (trainerId) builder = builder.eq('trainer_id', trainerId)
  if (featured !== undefined) builder = builder.eq('is_featured', !!featured)
  const { data, error, count } = await builder
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw asCourseError('list', error)
  return { courses: (data || []).map(mapCourseRow), total: count ?? 0 }
}

export async function createCourseRow(input) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert({
      trainer_id: input.trainerId,
      title: input.title,
      domain: input.domain ?? null,
      description: input.description ?? null,
      difficulty: input.difficulty ?? null,
      duration: input.duration ?? null,
      objectives: Array.isArray(input.objectives) ? input.objectives : [],
      syllabus: Array.isArray(input.syllabus) ? input.syllabus : [],
      tags: Array.isArray(input.tags) ? input.tags : [],
      status: input.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      is_featured: !!input.isFeatured,
      // Module 19: the DB column defaults to 20 when not supplied on create.
      assessment_duration_minutes: input.assessmentDurationMinutes,
      published_at: input.status === 'PUBLISHED' ? new Date().toISOString() : null,
    })
    .select(COURSES_BASE)
    .single()
  if (error) throw asCourseError('create', error)
  return mapCourseRow(data)
}

export async function updateCourseRow(id, patch) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .update(writePatch(patch))
    .eq('id', id)
    .select(COURSES_BASE)
    .maybeSingle()
  if (error) throw asCourseError('update', error)
  return mapCourseRow(data)
}

// Translates the API read-shape patch to the frozen DB columns. NEVER accepts
// trainer_id / created_at / updated_at here (those are guarded in the service).
function writePatch(patch) {
  const out = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.domain !== undefined) out.domain = patch.domain
  if (patch.description !== undefined) out.description = patch.description
  if (patch.difficulty !== undefined) out.difficulty = patch.difficulty
  if (patch.duration !== undefined) out.duration = patch.duration
  if (patch.objectives !== undefined) out.objectives = patch.objectives
  if (patch.syllabus !== undefined) out.syllabus = patch.syllabus
  if (patch.tags !== undefined) out.tags = patch.tags
  if (patch.status !== undefined) {
    out.status = patch.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    if (out.status === 'PUBLISHED') out.published_at = patch.publishedAt || new Date().toISOString()
    else out.published_at = null
  }
  if (patch.isFeatured !== undefined) out.is_featured = !!patch.isFeatured
  if (patch.assessmentDurationMinutes !== undefined) out.assessment_duration_minutes = patch.assessmentDurationMinutes
  out.updated_at = new Date().toISOString()
  return out
}

export async function deleteCourseRow(id) {
  const { error } = await supabaseAdmin.from('courses').delete().eq('id', id)
  if (error) throw asCourseError('delete', error)
  return true
}

// ---------------------------------------------------------------------------
// COURSE SECTIONS (content storage references)
// ---------------------------------------------------------------------------

export async function listSectionsForCourse(courseId) {
  const { data, error } = await supabaseAdmin
    .from('course_sections')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true })
  if (error) throw asCourseError('sections:list', error)
  return (data || []).map(mapSectionRow)
}

export async function createSectionRow(input) {
  const { data, error } = await supabaseAdmin
    .from('course_sections')
    .insert({
      course_id: input.courseId,
      section_type: input.sectionType,
      order_index: input.orderIndex ?? 0,
      title: input.title ?? null,
      storage_bucket: input.storageBucket ?? null,
      storage_path: input.storagePath ?? null,
      mime_type: input.mimeType ?? null,
      file_size: input.fileSize ?? null,
      original_filename: input.originalFilename ?? null,
      legacy_storage_path: input.legacyStoragePath ?? null,
    })
    .select('*')
    .single()
  if (error) throw asCourseError('sections:create', error)
  return mapSectionRow(data)
}

export async function removeSectionRow(id) {
  const { error } = await supabaseAdmin.from('course_sections').delete().eq('id', id)
  if (error) throw asCourseError('sections:delete', error)
  return true
}

// ---------------------------------------------------------------------------
// QUESTION BANK
// ---------------------------------------------------------------------------

export async function listQuestionsForCourse(courseId, { validOnly = false } = {}) {
  let builder = supabaseAdmin.from('questions').select('*').eq('course_id', courseId)
  if (validOnly) builder = builder.eq('is_valid', true)
  const { data, error } = await builder.order('created_at', { ascending: true })
  if (error) throw asCourseError('questions:list', error)
  return (data || []).map(mapQuestionRow)
}

export async function findQuestionById(courseId, questionId) {
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .eq('course_id', courseId)
    .maybeSingle()
  if (error) throw asCourseError('questions:lookup', error)
  return mapQuestionRow(data)
}

export async function createQuestionRow(input) {
  const { data, error } = await supabaseAdmin
    .from('questions')
    .insert({
      course_id: input.courseId,
      difficulty: input.difficulty ?? 'EASY',
      text: input.text,
      topic: input.topic ?? null,
      options: Array.isArray(input.options) ? input.options : [],
      correct_option_index: input.correctOptionIndex ?? null,
      tag_label: input.tagLabel ?? null,
      question_type: 'MCQ',
      is_valid: input.isValid ?? false,
    })
    .select('*')
    .single()
  if (error) throw asCourseError('questions:create', error)
  return mapQuestionRow(data)
}

export async function updateQuestionRow(questionId, patch) {
  const out = {}
  if (patch.difficulty !== undefined) out.difficulty = patch.difficulty
  if (patch.text !== undefined) out.text = patch.text
  if (patch.topic !== undefined) out.topic = patch.topic
  if (patch.options !== undefined) out.options = patch.options
  if (patch.correctOptionIndex !== undefined) out.correct_option_index = patch.correctOptionIndex
  if (patch.tagLabel !== undefined) out.tag_label = patch.tagLabel
  if (patch.isValid !== undefined) out.is_valid = patch.isValid
  const { data, error } = await supabaseAdmin
    .from('questions')
    .update(out)
    .eq('id', questionId)
    .select('*')
    .single()
  if (error) throw asCourseError('questions:update', error)
  return mapQuestionRow(data)
}

export async function deleteQuestionRow(questionId) {
  const { error } = await supabaseAdmin.from('questions').delete().eq('id', questionId)
  if (error) throw asCourseError('questions:delete', error)
  return true
}

// ---------------------------------------------------------------------------
// ERROR MAPPING
// ---------------------------------------------------------------------------
let _lastCollaborator = ''
function asCourseError(operation, error) {
  const code = error?.code
  const name = {
    lookup: 'COURSE_LOOKUP',
    list: 'COURSE_LIST',
    create: 'COURSE_CREATE',
    update: 'COURSE_UPDATE',
    delete: 'COURSE_DELETE',
  }[operation] || 'COURSE'

  if (code === '42P01' || /relation "?public\.courses"? does not exist/i.test(error?.message || '')) {
    return new ApiError(
      503,
      `${name}_UNAVAILABLE`,
      'The course storage is not ready. Apply the frozen Module 5 schema migration first.',
      { dbCode: code },
    )
  }

  if (code === '23503') {
    return new ApiError(
      400,
      `${name}_REFERENCE`,
      'The request references a course/trainer that does not exist.',
      { dbCode: code },
    )
  }

  if (code === '23505') {
    return new ApiError(409, `${name}_CONFLICT`, 'A conflicting course record already exists.', { dbCode: code })
  }

  if (code === '22P02' || (code === '23514' && /CHECK|violate|constraint/i.test(error?.message || ''))) {
    return new ApiError(400, `${name}_INVALID`, 'The course data violates the schema constraints.', {
      dbCode: code,
      dbMessage: error?.message,
    })
  }

  const fallback =
    operation === 'lookup'
      ? 'The course could not be resolved.'
      : 'The course operation could not be completed.'
  return new ApiError(500, `${name}_UNEXPECTED`, fallback, {
    dbCode: code,
    dbMessage: error?.message,
    collaborator: _lastCollaborator,
  })
}
