// Backend-backed user / profile / RBAC service (frontend side).
//
// Every call targets the Express backend's /api/users endpoints. The backend owns
// public.users (Module 5 schema) and holds the Supabase service-role key; the
// browser only sends the access token it already stores. The singleton API client
// in ./api.js is the ONLY place that talks to the transport.
//
// The admin capability search and role/approval mutations are ADMIN-only on the
// server (authorize('ADMIN') + requireApprovedUser); this client never re-implements
// that check — it just surfaces backend errors.
//
// Profile photos: the browser uploads the image to Cloudinary (unchanged module)
// and this client sends only the public_id + metadata, which the backend records
// in public.users(profile_photo_*). Delivery URLs are rebuilt here from the
// Cloudinary cloud name so the shared Avatar/photoURL behaviour is preserved.

import { api, getAccessToken } from './api'
import { uploadToCloudinary, isCloudinaryConfigured, validateImageFile } from './cloudinaryService'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || ''

// Rebuilds a Cloudinary delivery URL from a stored public_id (used when backend
// profiles carry photoPublicId but no absolute photoURL yet).
export function cloudPhotoUrl(publicId) {
  return publicId && CLOUD_NAME ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${publicId}` : ''
}

function withToken() {
  return { token: getAccessToken() }
}

export async function getMe() {
  return api.get('/users/me', withToken())
}

export async function updateMe(patch) {
  return api.patch('/users/me', patch, withToken())
}

// ADMIN
export async function listUsers() {
  return api.get('/users', withToken())
}

// ADMIN capability search (searches users.search_vector).
export async function searchUsers(query) {
  const q = String(query || '').trim()
  return api.get(`/users/search?q=${encodeURIComponent(q)}`, withToken())
}

// Self / approved viewer / ADMIN — the backend decides the projection.
export async function getUser(id) {
  return api.get(`/users/${encodeURIComponent(id)}`, withToken())
}

// ADMIN
export async function changeUserRole(id, role) {
  return api.patch(`/users/${encodeURIComponent(id)}/role`, { role }, withToken())
}

// ADMIN
export async function changeApprovalStatus(id, approvalStatus) {
  return api.patch(`/users/${encodeURIComponent(id)}/approval`, { approvalStatus }, withToken())
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

// Uploads a profile photo: Cloudinary first, then persists the reference to the
// backend public.users profile. Returns the refreshed profile or null on failure.
export async function uploadProfilePhoto(file) {
  if (!file) return null
  const imageErr = validateImageFile(file)
  if (imageErr) throw new Error(imageErr)
  if (!isCloudinaryConfigured()) {
    throw new Error('Photo storage is not configured. Configure Cloudinary to upload a profile photo.')
  }
  const result = await uploadToCloudinary(file, {
    folder: 'profiles',
    publicId: `photo-${Date.now()}.${extOf(file.name)}`,
    resourceType: 'image',
    metadata: { purpose: 'profile-photo' },
  })
  const data = await updateMe({
    photoPublicId: result.public_id,
    photoMimeType: file.type || '',
    photoSize: file.size,
    photoFilename: file.name,
  })
  return data?.profile || null
}

// ---------------------------------------------------------------------------
// MODULE 17 — PROFESSIONAL CERTIFICATIONS (self-service, backend-persisted)
// ---------------------------------------------------------------------------
// These mirror the backend /users/me/certifications CRUD. The backend owns
// ownership (derived from the access token) and the RBAC projection, so this
// client never sends a user id. Field names differ from the UI's historic
// mock shape (title/issuingOrganization/issueDate <-> certificationName/issuer/
// obtainedDate); the component adapts via the mappers below.

export function mapCertificationFromApi(c = {}) {
  return {
    id: c.id,
    title: c.certificationName || '',
    issuingOrganization: c.issuer || '',
    issueDate: c.obtainedDate || '',
    expiryDate: c.expiryDate || '',
    credentialId: c.credentialId || '',
    credentialUrl: c.credentialUrl || '',
    storagePath: c.storagePath || '',
    mimeType: c.mimeType || '',
    fileSize: c.fileSize ?? null,
    originalFilename: c.originalFilename || '',
    fileURL: certFileUrl(c),
  }
}

// Converts the UI form into the backend certification payload. Storage fields
// are only included when the form carries them (i.e. a file was uploaded or the
// edit started from a row that already has one), so a metadata-only edit never
// accidentally clears an existing file.
export function toCertificationPayload(form) {
  const payload = {
    certificationName: String(form.title || '').trim(),
    issuer: String(form.issuingOrganization || '').trim(),
    obtainedDate: form.issueDate || null,
    expiryDate: form.expiryDate || null,
    credentialId: String(form.credentialId || '').trim(),
    credentialUrl: String(form.credentialUrl || '').trim(),
  }
  if (form.storagePath !== undefined) {
    payload.storagePath = form.storagePath || null
    payload.mimeType = form.mimeType || ''
    payload.fileSize = form.fileSize ?? null
    payload.originalFilename = form.originalFilename || ''
  }
  return payload
}

// Rebuilds a Cloudinary delivery URL from a stored public_id. Images use the
// image endpoint; documents (pdf/docx/…) use the raw endpoint.
export function certFileUrl(cert) {
  const publicId = cert?.storagePath || cert?.public_id
  if (!publicId || String(publicId).startsWith('mock:') || !CLOUD_NAME) return ''
  const type = String(cert?.mimeType || '').startsWith('image/') ? 'image' : 'raw'
  return `https://res.cloudinary.com/${CLOUD_NAME}/${type}/upload/${publicId}`
}

export async function listMyCertifications() {
  const data = await api.get('/users/me/certifications', withToken())
  return Array.isArray(data?.certifications) ? data.certifications.map(mapCertificationFromApi) : []
}

export async function addMyCertification(form) {
  const data = await api.post('/users/me/certifications', toCertificationPayload(form), withToken())
  return data?.certification ? mapCertificationFromApi(data.certification) : null
}

export async function updateMyCertification(id, form) {
  const data = await api.patch(
    `/users/me/certifications/${encodeURIComponent(id)}`,
    toCertificationPayload(form),
    withToken(),
  )
  return data?.certification ? mapCertificationFromApi(data.certification) : null
}

export async function removeMyCertification(id) {
  return api.del(`/users/me/certifications/${encodeURIComponent(id)}`, withToken())
}

// Approved viewers/ADMIN can read another user's public certifications.
export async function getUserCertifications(id) {
  const data = await api.get(`/users/${encodeURIComponent(id)}/certifications`, withToken())
  return Array.isArray(data?.certifications) ? data.certifications.map(mapCertificationFromApi) : []
}

// Uploads a certification document to Cloudinary and returns the file reference
// the backend stores on the certification row (storage_path etc.).
export async function uploadCertificationFile(file) {
  if (!file) return null
  const result = await uploadToCloudinary(file, {
    folder: 'profiles/certifications',
    publicId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(file.name)}`,
    metadata: { purpose: 'certification' },
  })
  return {
    storagePath: result.public_id,
    mimeType: file.type || '',
    fileSize: file.size,
    originalFilename: file.name,
    fileURL: result.fileURL,
  }
}