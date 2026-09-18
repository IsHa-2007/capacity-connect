import { sendError } from '../utils/apiResponse.js'

export function notFound(req, res) {
  sendError(res, {
    status: 404,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
  })
}