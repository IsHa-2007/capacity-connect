// Thin JSON API client for the CAPACITY CONNECT backend.
//
// The frontend NEVER talks to Supabase directly for authentication. All auth
// (register / login / logout / me) goes through the Node.js + Express backend,
// which verifies Supabase access tokens server-side. Only the backend holds the
// Supabase service-role key — it is never referenced with a VITE_ prefix here.
//
// URL strategy (ONE source of truth): `VITE_API_BASE_URL` is the backend ORIGIN
// only (e.g. http://localhost:5000) and must NOT include the `/api` mount point.
// This client appends the canonical API_PREFIX ('/api') automatically, so callers
// pass resource paths WITHOUT the prefix (e.g. '/auth/register', '/users/me')
// and always reach /api/auth/register, /api/users/me, etc. The prefix lives ONLY
// in API_PREFIX below; a configured base that already ends in '/api' is
// normalised down to the origin so a double '/api/api' can never be produced.

const API_PREFIX = '/api'

// Normalises VITE_API_BASE_URL to a bare origin: strips trailing slashes and a
// trailing '/api' if someone configured it that way. Defaults to the origin of
// the local backend, which is appropriate for development.
function apiBaseUrl() {
  const raw = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')
  return raw.replace(/\/api$/i, '')
}

const API_BASE_URL = apiBaseUrl()

const TOKEN_KEY = 'capacity_connect_access_token'

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAccessToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable — session will not survive a reload */
  }
}

export function clearAccessToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

// Thrown for any HTTP response with a non-2xx status. `code` carries the
// backend error code (e.g. INVALID_CREDENTIALS, EMAIL_IN_USE, UNAUTHENTICATED).
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// True only for an HTTP-level failure (the API responded with an error).
// Network/transport failures throw a plain Error instead and are NOT ApiError.
export function isApiHttpError(err) {
  return err instanceof ApiError
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new Error(`Unable to reach the API at ${API_BASE_URL}${API_PREFIX}. Is the backend running?`, { cause: err })
  }

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!response.ok) {
    const apiError = json?.error
    throw new ApiError(apiError?.message || 'The request failed.', {
      status: response.status,
      code: apiError?.code || 'REQUEST_FAILED',
      details: apiError?.details,
    })
  }

  return json?.data === undefined ? null : json.data
}

export const api = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
}