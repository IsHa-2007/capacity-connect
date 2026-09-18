import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize, requireApprovedUser } from '../middleware/authorize.js'
import { updateMeSchema, roleChangeSchema, approvalChangeSchema } from '../validators/user.validator.js'
import * as controller from '../controllers/user.controller.js'

const router = Router()

// Self-service (any authenticated user, including PENDING accounts which may
// complete their profile while awaiting verification).
router.get('/me', authenticate, controller.getMe)
router.patch('/me', authenticate, validate(updateMeSchema), controller.updateMe)

// ADMIN-only directory / capability search / management. approve/reject/role
// changes additionally require the calling ADMIN to be APPROVED, so a PENDING
// admin (bootstrap edge case) cannot govern.
router.get('/', authenticate, authorize('ADMIN'), requireApprovedUser, controller.listUsers)
router.get('/search', authenticate, authorize('ADMIN'), requireApprovedUser, controller.searchUsers)

// Shared profile read: self, APPROVED admin (full) or any APPROVED user (public
// projection). Authorization is enforced in the service.
router.get('/:id', authenticate, controller.getUser)

router.patch('/:id/role', authenticate, authorize('ADMIN'), requireApprovedUser, validate(roleChangeSchema), controller.changeRole)
router.patch('/:id/approval', authenticate, authorize('ADMIN'), requireApprovedUser, validate(approvalChangeSchema), controller.changeApproval)

export default router