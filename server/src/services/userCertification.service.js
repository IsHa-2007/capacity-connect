// MODULE 17 — USER-CERTIFICATION SERVICE
//
// Self-added professional certifications on public.user_certifications, kept
// separate from platform-issued certificates (Module 12 identity rules untouched).
// Ownership is derived from the authenticated user id on every write; reads use
// the same RBAC matrix as getUserById (self / APPROVED admin full, any APPROVED
// user public). The certification-view matrix is exported as a pure function so
// m17verify can lock it without a database.

import { ApiError } from '../utils/apiResponse.js'
import { findProfileById } from '../repositories/user.repository.js'
import * as repo from '../repositories/certification.repository.js'

// Pure RBAC matrix for viewing a user's professional certifications.
export function certificationViewLevel(targetId, requesterId, requester) {
  if (String(targetId) === String(requesterId)) return 'full'
  if (!requester) return 'none'
  if (requester.role === 'ADMIN' && requester.approval_status === 'APPROVED') return 'full'
  if (requester.approval_status === 'APPROVED') return 'public'
  return 'none'
}

// Public-safe subset for non-self, non-admin viewers (no file refs / urls).
function publicCertification(cert) {
  return {
    id: cert.id,
    certificationName: cert.certificationName,
    issuer: cert.issuer,
    obtainedDate: cert.obtainedDate,
    expiryDate: cert.expiryDate,
  }
}

export function toUpdateRow(payload, existing = null) {
  const row = {
    certification_name: payload.certificationName,
    issuer: payload.issuer,
    obtained_date: payload.obtainedDate,
    credential_id: payload.credentialId || null,
    credential_url: payload.credentialUrl || null,
  }
  if (payload.expiryDate) row.expiry_date = payload.expiryDate
  else row.expiry_date = null

  // File reference: send storagePath to set/replace it, null to clear it, or
  // leave it absent (metadata-only edit) to keep the existing file row.
  if (payload.storagePath !== undefined) {
    if (payload.storagePath) {
      row.storage_bucket = 'cloudinary'
      row.storage_path = payload.storagePath
      row.mime_type = payload.mimeType || null
      row.file_size = payload.fileSize ?? null
      row.original_filename = payload.originalFilename || null
    } else {
      row.storage_bucket = null
      row.storage_path = null
      row.mime_type = null
      row.file_size = null
      row.original_filename = null
    }
  } else if (existing) {
    row.storage_bucket = existing.storage_bucket
    row.storage_path = existing.storage_path
    row.mime_type = existing.mime_type
    row.file_size = existing.file_size
    row.original_filename = existing.original_filename
  } else {
    row.storage_bucket = null
    row.storage_path = null
    row.mime_type = null
    row.file_size = null
    row.original_filename = null
  }
  return row
}

export async function listMyCertifications(userId) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const rows = await repo.listCertifications({ userId })
  return { certifications: rows.map(repo.toCertification) }
}

export async function addCertification(userId, payload) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const row = { user_id: userId, ...toUpdateRow(payload) }
  const stored = await repo.insertCertification(row)
  return { certification: repo.toCertification(stored) }
}

export async function updateMyCertification(userId, certificationId, payload) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const existing = await repo.findCertification({ userId, certificationId })
  if (!existing) throw new ApiError(404, 'CERTIFICATION_NOT_FOUND', 'No such certification exists on this account.')
  const patch = toUpdateRow(payload, existing)
  if (patch.certification_name === undefined) throw new ApiError(400, 'VALIDATION_ERROR', 'No certification fields were provided.')
  const stored = await repo.updateCertification({ userId, certificationId, patch })
  return { certification: repo.toCertification(stored) }
}

export async function removeMyCertification(userId, certificationId) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const deleted = await repo.deleteCertification({ userId, certificationId })
  if (!deleted) throw new ApiError(404, 'CERTIFICATION_NOT_FOUND', 'No such certification exists on this account.')
  return { deleted: true, id: deleted.id }
}

// RBAC-aware view of another user's professional certifications (the public
// professional profile surface), mirroring getUserById's permissions.
export async function getUserCertifications(targetId, requesterId) {
  if (!requesterId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')

  // The target must exist (same "no such user" contract as /users/:id).
  const target = await findProfileById(targetId)
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'No such user exists.')
  const requester = String(targetId) === String(requesterId) ? null : await findProfileById(requesterId)
  if (!requester && String(targetId) !== String(requesterId)) {
    throw new ApiError(403, 'PROFILE_NOT_FOUND', 'Your application profile could not be resolved.')
  }

  const level = certificationViewLevel(targetId, requesterId, requester)
  if (level === 'none') {
    throw new ApiError(403, 'APPROVAL_REQUIRED', 'Your account has not been approved yet.')
  }

  const rows = await repo.listCertifications({ userId: targetId })
  const certifications = rows.map(repo.toCertification)
  return {
    certifications: level === 'full' ? certifications : certifications.map(publicCertification),
  }
}