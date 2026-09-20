// Module 8 — COURSE & QUESTION-BANK SERVICE
//
// The single authority for every Module 8 BUSINESS rule. It owns:
//   * RBAC      — only an APPROVED TRAINER may manage courses, and only the
//                 courses they OWN (trainer_id == actor id). TRAINEES and ADMINS
//                 read. All enforcement happens HERE, never in the repository
//                 (the repository is deliberately auth-agnostic).
//   * Publish gate — a course may only be PUBLISHED once its question bank
//                 holds at least MIN_VALID_QUESTIONS (5) VALID questions.
//                 is_valid on each question is a per-row flag maintained by the
//                 repository trigger/service; this service never bypasses it.
//   * Content   — non-NOTES sections store storage metadata (bucket + path +
//                 mime + size + original filename) via storage.service; file
//                 bodies never live in a canonical file_url column. Signed URLs
//                 for content are generated on demand.

import { randomUUID } from 'node:crypto'
import { ApiError } from '../utils/apiResponse.js'
import * as repo from '../repositories/course.repository.js'
import {
  STORAGE_BUCKET,
  upload as storageUpload,
  createSignedUrl as storageCreateSignedUrl,
  remove as storageRemove,
} from '../services/storage.service.js'
import { materialForFolderError } from '../services/materialRules.service.js'
import { ROLE_TRAINER, ROLE_ADMIN, ROLE_TRAINEE, isApproved } from '../lib/roles.js'

export const MIN_VALID_QUESTIONS = 5

const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD']

// A question is structurally valid when it satisfies the SAME contract the
// frozen questions.is_valid column guards (the migration comment says the flag
// is "computed by the application/migration"). The frontend never sends
// isValid and the validator strips client-supplied values, so the SERVICE is
// the computing authority: non-empty text, >= 2 non-empty options, an integer
// correctOptionIndex inside the options array, and a known difficulty.
function questionIsStructurallyValid(q) {
  const options = Array.isArray(q?.options)
    ? q.options.filter((o) => typeof o === 'string' && String(o).trim().length > 0)
    : []
  const textOk = typeof q?.text === 'string' && q.text.trim().length > 0
  const indexOk = Number.isInteger(q?.correctOptionIndex) && q.correctOptionIndex >= 0 && q.correctOptionIndex < options.length
  const difficultyOk = QUESTION_DIFFICULTIES.includes(q?.difficulty)
  return textOk && options.length >= 2 && indexOk && difficultyOk
}

// ---------------------------------------------------------------------------
// RBAC HELPERS
// ---------------------------------------------------------------------------

function requireActor(actor) {
  if (!actor) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.')
  }
}

function requireTrainer(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_TRAINER || !isApproved(actor)) {
    throw new ApiError(
      403,
      'TRAINER_ROLE_REQUIRED',
      'Only an APPROVED TRAINER can manage course content.',
    )
  }
}

function requireAdmin(actor) {
  requireActor(actor)
  if (actor.role !== ROLE_ADMIN) {
    throw new ApiError(403, 'ADMIN_ROLE_REQUIRED', 'Only an ADMIN can perform this operation.')
  }
}

function requireOwner(actor, course) {
  requireTrainer(actor)
  if (!course || String(course.trainerId) !== String(actor.id)) {
    throw new ApiError(
      403,
      'COURSE_OWNERSHIP',
      'You can only manage courses that you own.',
    )
  }
}

// ---------------------------------------------------------------------------
// COURSE READ
// ---------------------------------------------------------------------------

export async function listCourses(actor, query = {}) {
  requireActor(actor)
  // Trainees only ever see published courses through the catalog. Trainers and
  // admins keep the full (status-filtered) view for management.
  const status = actor.role === ROLE_TRAINEE ? 'PUBLISHED' : query.status
  return repo.listCourses({
    status,
    trainerId: query.trainerId,
    featured: query.featured !== undefined ? query.featured : undefined,
    limit: Math.min(Number(query.limit) || 200, 200),
    offset: Math.max(0, Number(query.offset) || 0),
  })
}

export async function getCourse(actor, courseId) {
  requireActor(actor)
  const course = await repo.findCourseById(courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  // Draft courses are management-only; a trainee may never read one (404, not
  // 403, so the existence of drafts is not disclosed to trainees).
  if (actor.role === ROLE_TRAINEE && course.status !== 'PUBLISHED') {
    throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  }
  return course
}

// ---------------------------------------------------------------------------
// COURSE WRITE (TRAINER-OWNER)
// ---------------------------------------------------------------------------

export async function createCourse(actor, input) {
  requireTrainer(actor)
  return repo.createCourseRow({
    ...input,
    trainerId: actor.id,
  })
}

export async function updateCourse(actor, courseId, patch) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)

  // Publish gate: PUBLISHED requires >= MIN_VALID_QUESTIONS valid questions in
  // the bank. Only questions whose is_valid is TRUE count.
  if (patch.status === 'PUBLISHED') {
    const questions = await repo.listQuestionsForCourse(courseId, { validOnly: true })
    if (questions.length < MIN_VALID_QUESTIONS) {
      throw new ApiError(
        409,
        'QUESTION_BANK_READY',
        `A course needs at least ${MIN_VALID_QUESTIONS} valid questions before it can be published. ` +
          `This course currently has ${questions.length} valid question(s).`,
      )
    }
  }

  return repo.updateCourseRow(courseId, patch)
}

export async function deleteCourse(actor, courseId) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)
  await repo.deleteCourseRow(courseId)
  return true
}

// ---------------------------------------------------------------------------
// SECTIONS (content)
// ---------------------------------------------------------------------------

export async function listSections(actor, courseId) {
  requireActor(actor)
  const course = await repo.findCourseById(courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  // Course material (including signed download URLs) is trainer/owner-facing and
  // admin-facing only. Trainees consume materials through the enrollment
  // workspace lesson flow, which authorizes per-enrollment — never by pulling
  // the raw section list of an arbitrary course.
  if (actor.role !== ROLE_ADMIN) requireOwner(actor, course)
  const sections = await repo.listSectionsForCourse(courseId)
  // Storage-backed materials are served as on-demand signed URLs (the same
  // contract the enrollment workspace uses), never permanent public URLs.
  return Promise.all(
    sections.map(async (section) => {
      if (!section.storagePath) return section
      const { signedUrl } = await storageCreateSignedUrl(section.storagePath)
      return { ...section, signedUrl: signedUrl || null }
    }),
  )
}

export async function addSection(actor, courseId, input) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)
  return repo.createSectionRow({ ...input, courseId })
}

const SECTION_TYPE_FOLDER = {
  NOTES: 'notes',
  SLIDES: 'slides',
  VIDEOS: 'videos',
  PRACTICE: 'practice',
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

// Upload a course material file into the private storage bucket and record the
// section row. The file bytes never live in the database — only the storage
// metadata (bucket + path + mime + size + original filename) is persisted,
// exactly like the Module 8 frozen contract. The file body is uploaded FIRST so
// a rejected format or a missing bucket fails before any row is written; if the
// row insert then fails the just-uploaded object is best-effort removed so a
// failed upload never leaves an orphaned file behind.
export async function uploadSection(actor, courseId, { file, sectionType, orderIndex, title }) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)

  if (!file) {
    throw new ApiError(400, 'FILE_REQUIRED', 'A file is required for this section.')
  }

  const formatError = materialForFolderError(sectionType, file.originalname, file.mimetype)
  if (formatError) {
    throw new ApiError(400, 'FILE_TYPE_UNSUPPORTED', formatError)
  }

  const folder = SECTION_TYPE_FOLDER[sectionType]
  if (!folder) {
    throw new ApiError(400, 'SECTION_TYPE_INVALID', `Unsupported section type: ${sectionType}.`)
  }

  // Namespace by courseId + folder so course files never collide and remain
  // grouped in the bucket, and always use a fresh UUID so re-uploads of the
  // same original file name create a distinct object without clobbering.
  const ext = extOf(file.originalname)
  const storagePath = `courses/${courseId}/${folder}/${randomUUID()}.${ext}`

  await storageUpload({
    path: storagePath,
    body: file.buffer,
    contentType: file.mimetype || 'application/octet-stream',
    metadata: { courseId, sectionType, uploadedBy: actor.id },
  })

  try {
    return await repo.createSectionRow({
      courseId,
      sectionType,
      orderIndex,
      title,
      storageBucket: STORAGE_BUCKET,
      storagePath,
      mimeType: file.mimetype || null,
      fileSize: file.size,
      originalFilename: file.originalname,
    })
  } catch (err) {
    await storageRemove([storagePath]).catch(() => {})
    throw err
  }
}

export async function removeSection(actor, courseId, sectionId) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)
  const section = (await repo.listSectionsForCourse(courseId)).find((s) => String(s.id) === String(sectionId))
  const removed = await repo.removeSectionRow(sectionId)
  // Clean up the stored object when this section was storage-backed (best-effort;
  // a missing object is not an error for the caller).
  if (section?.storagePath) {
    await storageRemove([section.storagePath]).catch(() => {})
  }
  return removed
}

// ---------------------------------------------------------------------------
// QUESTION BANK
// ---------------------------------------------------------------------------

export async function listQuestions(actor, courseId, { validOnly = false } = {}) {
  requireActor(actor)
  const course = await repo.findCourseById(courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  // Module 10 rule (§5/§19): trainees receive questions ONLY through the
  // assessment flow — never the raw question bank (which carries correct answers).
  if (actor.role === ROLE_TRAINEE) {
    throw new ApiError(
      403,
      'QUESTION_BANK_ACCESS_DENIED',
      'Trainees can only access questions through an assessment.',
    )
  }
  if (actor.role !== ROLE_ADMIN) requireOwner(actor, course)
  return repo.listQuestionsForCourse(courseId, { validOnly })
}

export async function getQuestion(actor, courseId, questionId) {
  requireActor(actor)
  const course = await repo.findCourseById(courseId)
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'The course could not be found.')
  if (actor.role === ROLE_TRAINEE) {
    throw new ApiError(
      403,
      'QUESTION_BANK_ACCESS_DENIED',
      'Trainees can only access questions through an assessment.',
    )
  }
  if (actor.role !== ROLE_ADMIN) requireOwner(actor, course)
  const question = await repo.findQuestionById(courseId, questionId)
  if (!question) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'The question could not be found.')
  return question
}

export async function addQuestion(actor, courseId, input) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)
  // The service is the computing authority for questions.is_valid (see
  // questionIsStructurallyValid). The DB default is FALSE; the repo honors an
  // explicit isValid when provided.
  const isValid = questionIsStructurallyValid(input)
  return repo.createQuestionRow({ ...input, courseId, isValid })
}

export async function updateQuestion(actor, courseId, questionId, patch) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)
  const existing = await repo.findQuestionById(courseId, questionId)
  if (!existing) throw new ApiError(404, 'QUESTION_NOT_FOUND', 'The question could not be found.')
  // Recompute is_valid for the MERGED state (existing row + patch): a partial
  // update may flip any structural field and thus invalidate or re-validate the
  // row. The repo only trusts the service-computed flag.
  const merged = { ...existing, ...patch }
  return repo.updateQuestionRow({ ...patch, isValid: questionIsStructurallyValid(merged) })
}

export async function removeQuestion(actor, courseId, questionId) {
  const course = await repo.findCourseById(courseId)
  requireOwner(actor, course)
  await repo.deleteQuestionRow(questionId)
  return true
}
