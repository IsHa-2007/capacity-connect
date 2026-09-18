// MODULE 9 — ENROLLMENT ROUTES
//
// Mirrors Module 8 course.routes exactly: every route is behind `authenticate`,
// params/body are validated (zod) BEFORE the controller, and the service stays
// the single RBAC authority. Trainees do themselves no favors: user_id /
// trainer_id / course_id are never accepted by the validators, so a client can
// never smuggle them — the service enforces the same again.

import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { validate } from '../middleware/validate.js'
import * as controller from '../controllers/enrollment.controller.js'
import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
  enrollmentIdParamSchema,
} from '../validators/enrollment.validator.js'

const router = Router()

router.get('/', authenticate, controller.listEnrollments)
router.post('/', authenticate, validate(createEnrollmentSchema), controller.enroll)
router.get('/:id', authenticate, validate(enrollmentIdParamSchema, 'params'), controller.getEnrollment)
router.get('/:id/workspace', authenticate, validate(enrollmentIdParamSchema, 'params'), controller.getWorkspace)
router.patch('/:id', authenticate, validate(enrollmentIdParamSchema, 'params'), validate(updateEnrollmentSchema), controller.updateEnrollment)

export default router
