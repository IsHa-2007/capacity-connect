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