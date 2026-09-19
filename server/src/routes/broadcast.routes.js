import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize, requireApprovedUser } from '../middleware/authorize.js'
import { createBroadcastSchema, broadcastIdParamSchema } from '../validators/broadcast.validator.js'
import * as controller from '../controllers/broadcast.controller.js'

const router = Router()

// Create: ADMIN (any audience) or APPROVED TRAINER (owned, course-linked only).
// validate() runs AFTER authenticate/authorize so identity+capability is
// established before any payload is parsed (no info leak to anonymous callers).
router.post('/', authenticate, authorize('ADMIN', 'TRAINER'), requireApprovedUser, validate(createBroadcastSchema), controller.createBroadcast)

// List: any authenticated user — role/scope resolution happens in the service.
router.get('/', authenticate, controller.listBroadcasts)

// Delete: ADMIN only (notifications keep their own title/body snapshot via
// ON DELETE SET NULL on broadcast_id).
router.delete('/:id', authenticate, authorize('ADMIN'), requireApprovedUser, validate(broadcastIdParamSchema, 'params'), controller.deleteBroadcast)

export default router