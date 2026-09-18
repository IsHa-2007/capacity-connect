export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function sendSuccess(res, data = null, status = 200, message) {
  const body = { success: true }
  if (message) body.message = message
  body.data = data
  return res.status(status).json(body)
}

export function sendError(res, { status = 500, code = 'INTERNAL_SERVER_ERROR', message = 'An unexpected error occurred.', details }) {
  const body = { success: false, error: { code, message } }
  if (details !== undefined) body.error.details = details
  return res.status(status).json(body)
}