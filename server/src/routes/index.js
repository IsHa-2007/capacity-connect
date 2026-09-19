import { Router } from 'express'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import userRoutes from './user.routes.js'
import courseRoutes from './course.routes.js'
import enrollmentRoutes from './enrollment.routes.js'
import assessmentRoutes from './assessment.routes.js'

// Future API namespaces (later modules) will mount here:
// /feedback /certificates /broadcasts /notifications
// /competency /storage
// They are intentionally not registered until implemented.

const router = Router()

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/courses', courseRoutes)
router.use('/enrollments', enrollmentRoutes)
router.use('/enrollments', assessmentRoutes)

export default router
