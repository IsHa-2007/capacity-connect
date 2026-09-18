import { ApiError, sendError } from '../utils/apiResponse.js'

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return sendError(res, {
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    })
  }

  if (err?.name === 'ZodError') {
    const details = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    return sendError(res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data.',
      details,
    })
  }

  if (err && err.expose === true && typeof err.statusCode === 'number') {
    return sendError(res, {
      status: err.statusCode,
      code: err.statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST_BODY',
      message: err.statusCode === 413 ? 'Request body too large.' : 'Malformed request body.',
    })
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err)
  return sendError(res, {
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  })
}