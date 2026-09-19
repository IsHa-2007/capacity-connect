// MODULE 10 — ASSESSMENT ROUTES
//
// Spec §20 contract, mounted at /api/enrollments. All submerged question-bank
// endpoints stay in Module 8 (/courses/:id/questions). Every route here is
// behind `authenticate`; params are validated BEFORE the controller; the service
// is the single RBAC + scoring authority.

import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { validate } from '../middleware/validate.js'
import * as controller from '../controllers/assessment.controller.js'
import {
  startAssessmentParamsSchema,
  submitAttemptParamsSchema,
  listAttemptsParamsSchema,
  submitAttemptSchema,
} from '../validators/assessment.validator.js'

const router = Router()

// Declared before the :attemptId patterns so the literal /assessment/attempts
// segment is unambiguous for the history endpoint.
router.post('/:enrollmentId/assessment/start', authenticate, validate(startAssessmentParamsSchema, 'params'), controller.startAssessment)
router.post('/:enrollmentId/assessment/:attemptId/submit', authenticate, validate(submitAttemptParamsSchema, 'params'), validate(submitAttemptSchema), controller.submitAssessment)
router.get('/:enrollmentId/assessment/attempts', authenticate, validate(listAttemptsParamsSchema, 'params'), controller.listAttempts)

export default router