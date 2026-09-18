// MODULE 9 — ENROLLMENT VALIDATORS
//
// Zod request shapes matching the FROZEN Module 9 contract. They only describe
// the HTTP envelope — every authorization decision stays in the service. The
// update schema deliberately offers ONLY the progression fields that exist on
// public.enrollments (status / progress / started_at / completed_at). Keys like
// user_id, course_id and trainer_id are never accepted: a client that tries to
// smuggle them gets a FATAL_ALIEN_FIELD validation error instead of a silent
// write.

import { z } from 'zod'
import { ApiError } from '../utils/apiResponse.js'

export const ENROLLMENT_STATUSES = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

const uuid = (label) => z.string().uuid(`${label} must be a valid UUID.`)

export const enrollmentIdParamSchema = z.object({
  id: uuid('Enrollment id'),
})

export const createEnrollmentSchema = z.object({
  courseId: uuid('Course id'),
})

// Only progression fields are writable. `started_at` and `completed_at` must be
// ISO-8601 timestamps; `progress` is a 0–100 integer; `status` is one of the
// four frozen statuses Edition.
export const updateEnrollmentSchema = z
  .object({
    status: z
      .enum(ENROLLMENT_STATUSES, {
        errorMap: () => ({
          message: `status must be one of: ${ENROLLMENT_STATUSES.join(', ')}`,
        }),
      })
      .optional(),
    progress: z.coerce.number().int('progress must be an integer.').min(0, 'progress must be at least 0.').max(100, 'progress cannot exceed 100.').optional(),
    startedAt: z.string().datetime({ offset: true }, 'startedAt must be an ISO-8601 timestamp.').optional(),
    completedAt: z.string().datetime({ offset: true }, 'completedAt must be an ISO-8601 timestamp.').optional(),
  })
  .strict('Only status, progress, startedAt and completedAt are writable on an enrollment.')
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one progression field must be provided.',
  })
  .superRefine((v, ctx) => {
    // A completed_at without a started_at is meaningless; a CANCELLED
    // enrollment cannot also be COMPLETED at the same instant.
    if (v.completedAt !== undefined && v.startedAt === undefined) {
      ctx.addIssue({ code: 'custom', path: ['completedAt'], message: 'completedAt requires a startedAt.' })
    }
    if (v.status === 'COMPLETED' && v.completedAt === undefined) {
      ctx.addIssue({ code: 'custom', path: ['status'], message: 'Marking an enrollment COMPLETED requires a completedAt.' })
    }
  })

export function asEnrollmentValidationError(issues) {
  return new ApiError(
    400,
    'ENROLLMENT_VALIDATION_ERROR',
    'The enrollment request failed validation.',
    issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
}
