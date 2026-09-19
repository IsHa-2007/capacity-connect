import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/authenticate.js'
import { notificationIdParamSchema } from '../validators/notification.validator.js'
import * as controller from '../controllers/notification.controller.js'

const router = Router()

// All notification endpoints are owner-scoped: the backend derives the owner
// from the access token and every repository call filters by it.
router.get('/', authenticate, controller.listNotifications)
router.get('/unread-count', authenticate, controller.unreadCount)
router.patch('/:id/read', authenticate, validate(notificationIdParamSchema, 'params'), controller.markNotificationRead)
router.patch('/read-all', authenticate, controller.markAllNotificationsRead)

export default router