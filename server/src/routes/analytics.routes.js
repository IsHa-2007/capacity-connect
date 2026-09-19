import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { authorize, requireApprovedUser } from '../middleware/authorize.js'
import { validate } from '../middleware/validate.js'
import {
  officerMatchSchema,
  officerDispatchSchema,
  assignmentIdParamSchema,
  assignmentStatusSchema,
} from '../validators/dispatch.validator.js'
import * as controller from '../controllers/analytics.controller.js'

const router = Router()

// Both analytics surfaces are ADMIN-only and require an APPROVED admin: the
// aggregates reveal org-wide workforce data that neither trainers nor trainees
// are entitled to. No query params are accepted (the service decides the window).
router.get('/insights', authenticate, authorize('ADMIN'), requireApprovedUser, controller.getInsights)
router.get('/regional', authenticate, authorize('ADMIN'), requireApprovedUser, controller.getRegional)

// Module 17A/17B — regional officer dispatch. Officer discovery is a read;
// dispatch and the assignment roster/state transitions are writes that persist
// to public.duty_assignments (ADMIN-only, APPROVED admins only).
router.post('/regional/officer-matches', authenticate, authorize('ADMIN'), requireApprovedUser, validate(officerMatchSchema), controller.findOfficerMatches)
router.post('/regional/dispatch', authenticate, authorize('ADMIN'), requireApprovedUser, validate(officerDispatchSchema), controller.dispatchOfficers)
router.get('/regional/assignments', authenticate, authorize('ADMIN'), requireApprovedUser, controller.listAssignments)
router.patch(
  '/regional/assignments/:id/status',
  authenticate,
  authorize('ADMIN'),
  requireApprovedUser,
  validate(assignmentIdParamSchema, 'params'),
  validate(assignmentStatusSchema),
  controller.updateAssignmentStatus,
)
router.post(
  '/regional/assignments/:id/cancel',
  authenticate,
  authorize('ADMIN'),
  requireApprovedUser,
  validate(assignmentIdParamSchema, 'params'),
  controller.cancelAssignment,
)

export default router