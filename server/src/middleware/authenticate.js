import { ApiError } from '../utils/apiResponse.js'
import { supabase } from '../lib/supabase.js'

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    if (!header.startsWith('Bearer ')) {
      return next(
        new ApiError(
          401,
          'UNAUTHENTICATED',
          'Missing or malformed Authorization header. Expected "Authorization: Bearer <token>".',
        ),
      )
    }
    const token = header.slice('Bearer '.length).trim()
    if (!token) {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Missing access token.'))
    }

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) {
      return next(new ApiError(401, 'UNAUTHENTICATED', error?.message || 'Invalid or expired access token.'))
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      phone: data.user.phone || null,
    }
    req.authToken = token
    return next()
  } catch (err) {
    return next(err)
  }
}