// MODULE 10 — ASSESSMENT VALIDATOR
//
// Fresh zod contracts for the three assessment endpoints. Mirrors the Module 9
// validator conventions (uuid helper, .strict() to reject alien keys, refinements
// for cross-field rules). Question-bank payloads are NOT revalidated here — they
// are already owned by Module 8 (course.validator.js: createQuestionSchema /
// updateQuestionSchema / questionIdParamSchema) and reused, never duplicated.

import { z } from 'zod'
import { ApiError } from '../utils/apiResponse.js'

const uuid = (label) => z.string().uuid(`${label} must be a valid UUID.`)

// Each submitted answer references an instance of a snapshot question plus the
// chosen option index. New attempts snapshot questions with a unique
// `instanceId` (a 20-instance exam may legally repeat the same question, so the
// instance id — not the question id — is the submission key). Legacy attempts
// (or clients) may still address a question by its `questionId`; exactly ONE of
// the two must be present per answer. optionIndex is positional within that
// instance's delivered option array.
export const answerSchema = z
  .object({
    questionId: uuid('Question id').optional(),
    instanceId: z.string().min(3, 'instanceId must be a non-empty instance key.').max(160).optional(),
    optionIndex: z.number().int().min(0, 'optionIndex must be a non-negative integer.'),
  })
  .refine((a) => (a.questionId != null) !== (a.instanceId != null), {
    message: 'Provide exactly one of questionId or instanceId for each answer.',
    path: ['instanceId'],
  })

export const startAssessmentParamsSchema = z.object({
  enrollmentId: uuid('Enrollment id'),
})

export const submitAttemptParamsSchema = z.object({
  enrollmentId: uuid('Enrollment id'),
  attemptId: uuid('Attempt id'),
})

export const listAttemptsParamsSchema = z.object({
  enrollmentId: uuid('Enrollment id'),
})

// A trainee may submit zero answers (all unattempted), but every entry must be
// well-formed and unique per resolved key (instanceId, else questionId).
// integrity: option counts and snapshot membership are validated against the
// STORED snapshot in the service, because zod cannot see the snapshot.
export const submitAttemptSchema = z
  .object({
    answers: z
      .array(answerSchema)
      .max(200, 'Too many answers in a single submission.')
      .optional()
      .default([]),
    timeSpentSeconds: z.coerce.number().int().min(0, 'timeSpentSeconds must be >= 0.').optional().nullable(),
  })
  .strict('Unrecognized fields are rejected (score/percentage/passed are server-calculated only).')
  .superRefine((value, ctx) => {
    const seen = new Set()
    for (const answer of value.answers || []) {
      const key = answer.instanceId || answer.questionId
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate answer for question ${key}.`,
          path: ['answers'],
        })
        return
      }
      seen.add(key)
    }
  })

export function asAssessmentValidationError(issues) {
  return new ApiError(
    400,
    'ASSESSMENT_VALIDATION_ERROR',
    'The assessment request is invalid.',
    issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  )
}