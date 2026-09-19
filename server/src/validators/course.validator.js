import { z } from 'zod'
import { ApiError } from '../utils/apiResponse.js'

// ===========================================================================
// MODULE 8 — COURSE & QUESTION-BANK VALIDATORS
// ===========================================================================
// Zod request schemas that map 1:1 onto the FROZEN Module 5 migrations for
// public.courses / public.course_sections / public.questions. The validator is
// deliberately RBAC-free (authorization lives in the course.service). It only
// guarantees the API shape; the schema's own CHECK constraints and the service
// layer remain the final authority.

export const COURSE_DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] // frozen courses.difficulty
export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED'] // frozen courses.status
export const SECTION_TYPES = ['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE'] // frozen course_sections.section_type
export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] // frozen questions.difficulty
export const MIN_VALID_QUESTIONS_TO_PUBLISH = 5 // business rule enforced in the service

const nonEmptyText = (label, max = 5000) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`)

const stringArray = (label, max = 200, itemMax = 500) =>
  z
    .array(z.string().trim().max(itemMax, `${label} entries are too long.`))
    .max(max, `${label} has too many entries.`)

const difficulty = z.enum(COURSE_DIFFICULTIES, {
  errorMap: () => ({ message: `difficulty must be one of: ${COURSE_DIFFICULTIES.join(', ')}` }),
})

// ---------------------------------------------------------------------------
// COURSE CREATE / UPDATE
// ---------------------------------------------------------------------------

export const createCourseSchema = z.object({
  title: nonEmptyText('Course title', 200),
  domain: z.string().trim().max(200, 'Domain is too long.').optional().nullable(),
  description: z.string().trim().max(10000, 'Description is too long.').optional().nullable(),
  difficulty: difficulty.optional().nullable(),
  duration: z.string().trim().max(100, 'Duration is too long.').optional().nullable(),
  objectives: stringArray('Objectives').optional().default([]),
  syllabus: stringArray('Syllabus').optional().default([]),
  tags: stringArray('Tags', 50, 80).optional().default([]),
  status: z.enum(COURSE_STATUSES).optional().default('DRAFT'),
  isFeatured: z.boolean().optional().default(false),
})

// Publish requires a trainerId ONLY on create; the service still validates that
// the caller actually owns the target course using actor + trainer_id.
export const updateCourseSchema = z.object({
  title: nonEmptyText('Course title', 200).optional(),
  domain: z.string().trim().max(200, 'Domain is too long.').optional().nullable(),
  description: z.string().trim().max(10000, 'Description is too long.').optional().nullable(),
  difficulty: difficulty.optional().nullable(),
  duration: z.string().trim().max(100, 'Duration is too long.').optional().nullable(),
  objectives: stringArray('Objectives').optional(),
  syllabus: stringArray('Syllabus').optional(),
  tags: stringArray('Tags', 50, 80).optional(),
  status: z.enum(COURSE_STATUSES).optional(),
  isFeatured: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided.' })

export const listCoursesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  trainerId: z.string().uuid('trainerId must be a valid UUID.').optional(),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().min(1).max(200).optional().default(200),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export const courseIdParamSchema = z.object({
  id: z.string().uuid('Course id must be a valid UUID.'),
})

// ---------------------------------------------------------------------------
// COURSE SECTIONS (content)
// ---------------------------------------------------------------------------

export const createSectionSchema = z.object({
  sectionType: z.enum(SECTION_TYPES, {
    errorMap: () => ({ message: `sectionType must be one of: ${SECTION_TYPES.join(', ')}` }),
  }),
  orderIndex: z.coerce.number().int().min(0).optional().default(0),
  title: z.string().trim().max(200).optional().nullable(),
  storageBucket: z.string().trim().max(200).optional().nullable(),
  storagePath: z.string().trim().max(1000).optional().nullable(),
  mimeType: z.string().trim().max(100).optional().nullable(),
  fileSize: z.coerce.number().int().min(0).optional().nullable(),
  originalFilename: z.string().trim().max(300).optional().nullable(),
  legacyStoragePath: z.string().trim().max(1000).optional().nullable(),
})

export const updateSectionSchema = createSectionSchema.partial()

export const sectionIdParamSchema = z.object({
  sectionId: z.string().uuid('Section id must be a valid UUID.'),
})

// Multipart file-upload fields for POST /courses/:id/sections/upload. The file
// itself is parsed by multer (memory storage); these are the companion form
// fields. Storage metadata (bucket/path/mime/size/originalFilename) is ALWAYS
// derived server-side from the uploaded file and is never accepted from the
// client — the contract is identical to createSectionSchema's metadata fields.
export const uploadSectionFieldsSchema = z.object({
  sectionType: z.enum(SECTION_TYPES, {
    errorMap: () => ({ message: `sectionType must be one of: ${SECTION_TYPES.join(', ')}` }),
  }),
  orderIndex: z.coerce.number().int().min(0).optional().default(0),
  title: z.string().trim().max(200).optional().nullable(),
})

// ---------------------------------------------------------------------------
// QUESTION BANK
// ---------------------------------------------------------------------------
// A QUESTION is valid for publishing when it satisfies the SAME structural
// contract that Module 6 computes (is_valid in the frozen migration):
//   - non-empty text
//   - >= 2 options
//   - correctOptionIndex in [0, options.length)
// The QUANTITY rule (>= MIN_VALID_QUESTIONS_TO_PUBLISH) is enforced in the
// course.service, not here.

export const createQuestionSchema = z.object({
  difficulty: z.enum(QUESTION_DIFFICULTIES, {
    errorMap: () => ({ message: `difficulty must be one of: ${QUESTION_DIFFICULTIES.join(', ')}` }),
  }).optional().default('EASY'),
  text: nonEmptyText('Question text', 2000),
  topic: z.string().trim().max(200).optional().nullable(),
  options: z
    .array(z.string().trim().min(1, 'Each option must be non-empty.').max(500, 'Option text is too long.'))
    .min(2, 'A question requires at least two options.'),
  correctOptionIndex: z.coerce.number().int().min(0, 'correctOptionIndex must be >= 0.'),
  tagLabel: z.string().trim().max(100).optional().nullable(),
}).refine(
  (v) => v.correctOptionIndex < v.options.length,
  { message: 'correctOptionIndex must be within the options array.', path: ['correctOptionIndex'] },
)

// Zod v4 forbids `.partial()` on object schemas containing refinements, so the
// update shape is an explicit optional-field mirror of `createQuestionSchema`
// (asserting the same structural question contract), with a refinement that is
// GUARDED: the bounds check only runs when BOTH `options` and
// `correctOptionIndex` are present, so a partial update (e.g. only retagging)
// never fails.
export const updateQuestionSchema = z
  .object({
    difficulty: z
      .enum(QUESTION_DIFFICULTIES, {
        errorMap: () => ({ message: `difficulty must be one of: ${QUESTION_DIFFICULTIES.join(', ')}` }),
      })
      .optional(),
    text: nonEmptyText('Question text', 2000).optional(),
    topic: z.string().trim().max(200).optional().nullable(),
    options: z
      .array(z.string().trim().min(1, 'Each option must be non-empty.').max(500, 'Option text is too long.'))
      .min(2, 'A question requires at least two options.')
      .optional(),
    correctOptionIndex: z.coerce.number().int().min(0, 'correctOptionIndex must be >= 0.').optional(),
    tagLabel: z.string().trim().max(100).optional().nullable(),
  })
  .refine(
    (v) =>
      v.options === undefined ||
      v.correctOptionIndex === undefined ||
      v.correctOptionIndex < v.options.length,
    { message: 'correctOptionIndex must be within the options array.', path: ['correctOptionIndex'] },
  )

export const questionIdParamSchema = z.object({
  questionId: z.string().uuid('Question id must be a valid UUID.'),
})

// ---------------------------------------------------------------------------
// SEO/watchdog helper for the controller (never exported by default)
// ---------------------------------------------------------------------------
export function asValidationError(issues) {
  return new ApiError(
    400,
    'VALIDATION_ERROR',
    'The request failed validation.',
    issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
}
