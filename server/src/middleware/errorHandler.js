import { ApiError, sendError } from '../utils/apiResponse.js'

// Client-facing `details` must never contain raw database / Supabase error text.
// Repositories legitimately attach { dbCode, dbMessage } for server-side
// triage, but `dbCode` is an opaque constraint code while `dbMessage` can
// include table/column names or Postgres wording — so it is stripped here, at
// the single serialisation boundary, before anything reaches the client.
function sanitizeDetails(details) {
  if (Array.isArray(details)) return details.map((d) => sanitizeDetails(d))
  if (details && typeof details === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(details)) {
      if (key === 'dbMessage') continue
      out[key] = sanitizeDetails(value)
    }
    return out
  }
  return details
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return sendError(res, {
      status: err.status,
      code: err.code,
      message: err.message,
      details: sanitizeDetails(err.details),
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

  const bodyParserStatus = err?.expose === true ? Number(err?.statusCode ?? err?.status) : NaN
  if (Number.isInteger(bodyParserStatus) && [400, 413].includes(bodyParserStatus)) {
    return sendError(res, {
      status: bodyParserStatus,
      code: bodyParserStatus === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST_BODY',
      message: bodyParserStatus === 413 ? 'Request body too large.' : 'Malformed request body.',
    })
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err)
  return sendError(res, {
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  })
}