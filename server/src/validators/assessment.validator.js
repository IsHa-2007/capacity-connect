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

// Each submitted answer references a question id (must belong to the attempt's
// snapshot — enforced in the service) plus the chosen option index. optionIndex
// is positional within that question's delivered option array.
export const answerSchema = z.object({
  questionId: uuid('Question id'),
  optionIndex: z.number().int().min(0, 'optionIndex must be a non-negative integer.'),
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
// well-formed and unique per question. integrity: option counts and snapshot
// membership are validated against the STORED snapshot in the service, because
// zod cannot see the snapshot.
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
      if (seen.has(answer.questionId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate answer for question ${answer.questionId}.`,
          path: ['answers'],
        })
        return
      }
      seen.add(answer.questionId)
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