import { Router } from 'express'
import { sendSuccess } from '../utils/apiResponse.js'

const router = Router()

router.get('/', (_req, res) => {
  sendSuccess(
    res,
    {
      service: 'capacity-connect-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    200,
    'Capacity Connect API is running',
  )
})

export default router