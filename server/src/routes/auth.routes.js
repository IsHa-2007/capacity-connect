import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/authenticate.js'
import { registerSchema, loginSchema } from '../validators/auth.validator.js'
import * as controller from '../controllers/auth.controller.js'

const router = Router()

router.post('/register', validate(registerSchema), controller.register)
router.post('/login', validate(loginSchema), controller.login)
router.post('/logout', authenticate, controller.logout)
router.get('/me', authenticate, controller.getMe)

export default router