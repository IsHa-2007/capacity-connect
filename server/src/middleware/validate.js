import { ApiError } from '../utils/apiResponse.js'
import { env } from '../config/env.js'

// Never log secrets: password (and any token-ish field) is redacted before the
// request body is written to the terminal in development.
const REDACTED_KEYS = new Set(['password', 'token', 'accessToken', 'refreshToken', 'authorization'])

function safeShape(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(safeShape)
  const out = {}
  for (const [key, val] of Object.entries(value)) {
    if (REDACTED_KEYS.has(key)) out[key] = '[redacted]'
    else if (val === undefined) out[key] = '[undefined]'
    else out[key] = safeShape(val)
  }
  return out
}

export function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }))
}

// Parses `value` and returns the data, throwing the standard 400 envelope on
// failure. Used by controllers for request sources the middleware cannot assign
// (Express 5 exposes req.query through a getter).
export function parseOrThrow(schema, value, source = 'body') {
  const result = schema.safeParse(value)
  if (!result.success) {
    if (env.NODE_ENV !== 'production') {
      console.warn(`[validation] ${source} rejected:`, JSON.stringify(safeShape(value)))
    }
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request data.', formatIssues(result.error))
  }
  return result.data
}

// Express 5 exposes `req.query` through a getter-only accessor (no setter), so
// a strict-mode assignment like `req.query = parsed` throws
// `TypeError: Cannot set property query of ... which has only a getter`.
// Redefine the property on the request instance with an own DATA property so the
// validated value is visible to controllers exactly as before. `req.body` and
// `req.params` keep their plain-assignment path.
//
// `req.params` is special: several routes run MORE THAN ONE params validator on
// the same request (e.g. course.routes /:id/questions/:questionId has a
// `courseIdParamSchema` then a `questionIdParamSchema`). Replacing the whole
// `req.params` for each would drop the previously-parsed keys, so params are
// MERGED into the existing object instead of replaced.
function assignRequestValue(req, key, value) {
  if (key === 'params') {
    if (req.params) Object.assign(req.params, value)
    else req.params = value
    return
  }
  try {
    req[key] = value
  } catch {
    Object.defineProperty(req, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
  }
}

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const details = formatIssues(result.error)
      // Development-only diagnostics: log the exact issues and a redacted body
      // shape so a contract mismatch is obvious from the terminal.
      if (env.NODE_ENV !== 'production') {
        console.warn(`[validation] ${req.method} ${req.originalUrl} — ${details.length} issue(s):`)
        for (const issue of details) console.warn(`  - ${issue.path}: ${issue.message}`)
        console.warn('[validation] received body:', JSON.stringify(safeShape(req[source])))
      }
      return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request data.', details))
    }
    assignRequestValue(req, source, result.data)
    return next()
  }
}