// MODULE 12 — CERTIFICATE ROUTES
//
//   GET /certificates               authenticated, role-scoped list
//                                    (trainee → own, trainer → owned-course
//                                    certificates, admin → all)
//   GET /certificates/verify/:code  PUBLIC verification (verification-safe)
//
// The certificate GET-or-create for a single enrollment lives on the
// enrollment router (GET /enrollments/:id/certificate) so the existing
// authenticated + validated enrollment-id param is reused there.

import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { validate } from '../middleware/validate.js'
import { verifyLimiter } from '../middleware/rateLimit.js'
import * as controller from '../controllers/certificate.controller.js'
import { verificationCodeParamSchema } from '../validators/certificate.validator.js'

const router = Router()

// PUBLIC — must be registered before the authenticated list route? No: the two
// paths are distinct (/verify/:code vs /), so ordering here is cosmetic. It is
// intentionally PUBLIC (no authenticate()) per the verification contract; the
// verifyLimiter is applied because the endpoint is unauthenticated.
router.get('/verify/:verificationCode', verifyLimiter, validate(verificationCodeParamSchema, 'params'), controller.verifyCertificate)
router.get('/', authenticate, controller.listCertificates)

export default router