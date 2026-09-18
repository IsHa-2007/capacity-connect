import { findProfileById } from '../repositories/user.repository.js'
import { ApiError } from '../utils/apiResponse.js'

export const ROLES = ['ADMIN', 'TRAINER', 'TRAINEE']
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED']

export function authorize(...allowedRoles) {
  const allowed = new Set(allowedRoles)
  const invalid = [...allowed].filter((role) => !ROLES.includes(role))
  if (allowed.size === 0 || invalid.length > 0) {
    throw new Error(`authorize() requires at least one valid role of: ${ROLES.join(', ')}`)
  }
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'))
      }
      const profile = await findProfileById(req.user.id)
      if (!profile) {
        return next(new ApiError(403, 'PROFILE_NOT_FOUND', 'No application profile exists for this user.'))
      }
      if (!allowed.has(profile.role)) {
        return next(new ApiError(403, 'FORBIDDEN', 'Your role does not permit this operation.'))
      }
      req.profile = profile
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

export function requireApprovedUser(req, _res, next) {
  if (!req.profile) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.'))
  }
  if (req.profile.approval_status !== 'APPROVED') {
    return next(new ApiError(403, 'APPROVAL_REQUIRED', 'Your account has not been approved yet.'))
  }
  return next()
}