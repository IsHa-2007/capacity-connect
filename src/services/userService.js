// User service layer for CAPACITY CONNECT (DEV / MOCK path only).
//
// All user account, role and approval-status operations for the offline dev
// path live here. UI components must NOT mutate user records directly.
//
// REAL (supabase) users are served by the backend (userApi.js / AuthContext).
// This module is the isolated in-memory fallback used only when the backend is
// unreachable in local development (DEV_MOCK_AUTH). It does NOT use Firebase,
// Firestore or localStorage; it is not production persistence and is never
// advertised as such.
//
// Profile-photo / certification file uploads in this mock path go to Cloudinary
// when configured (unsigned browser preset) and otherwise resolve to temporary
// in-memory object URLs for the current page session only.

import { uploadToCloudinary, isCloudinaryConfigured, validateImageFile } from './cloudinaryService'
import { users as seedUsers } from '../data/mockData'

// ---------------------------------------------------------------------------
// MOCK / DEVELOPMENT-ONLY note: when uploads are unavailable, files resolve to
// in-memory browser object URLs that live for the current page session only.
// They are NEVER written to localStorage and reset on reload, mirroring the
// in-memory mock behaviour used elsewhere in development.

const MOCK_PROFILES = new Map(
  seedUsers.map((u) => [
    u.id,
    {
      uid: u.id,
      fullName: u.name,
      email: u.email,
      role: u.role,
      approvalStatus: u.status, // 'approved' | 'pending' | 'rejected'
      station: u.station,
      region: regionFor(u.station),
      organization: 'India Meteorological Department',
      department: u.department,
      empId: u.empId,
      title: u.title,
      expertise: u.expertise || [],
      specializations: u.specializations || [],
      skills: u.skills || [],
      qualifications: u.qualifications || [],
      professionalSummary: u.professionalSummary || '',
      yearsOfExperience: u.yearsOfExperience || u.experience || '',
      trainingInterests: u.trainingInterests || [],
      achievements: u.achievements || [],
      certifications: u.certifications || [],
      photoURL: u.photoURL || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileCompletion: profileCompletionFor({
        fullName: u.name,
        title: u.title,
        station: u.station,
        region: regionFor(u.station),
        professionalSummary: '',
        skills: u.skills || [],
        expertise: u.expertise || [],
        qualifications: [],
        certifications: [],
      }),
    },
  ]),
)

// Meaningful professional fields that count toward profile completion.
// Profile completion is deliberately INDEPENDENT of approval status. It measures
// only how complete the user's professional profile is (name, designation,
// station, region, summary, skills, expertise, qualifications, certifications).
// Whether the Admin has approved/rejected the account is tracked separately in
// `approvalStatus` and never influences this score. A pending user can therefore
// reach 100% when their professional profile is complete.
export function profileCompletionFor(p = {}) {
  const fields = [
    p.fullName,
    p.title,
    p.station,
    p.region,
    p.professionalSummary,
    ...(Array.isArray(p.skills) ? p.skills : []),
    ...(Array.isArray(p.expertise) ? p.expertise : []),
    ...(Array.isArray(p.qualifications) ? p.qualifications : []),
    ...(Array.isArray(p.certifications) ? p.certifications : []),
  ]
  const scored = fields.filter(Boolean).length
  // 13 = the 5 identity scalars + spread of the 4 professional arrays. Clamped to
  // 100 so an over-complete profile still reads as a clean 100% rather than >100.
  return Math.min(100, Math.round((scored / 13) * 100))
}

export function regionFor(station) {
  const map = {
    'New Delhi': 'North', Jaipur: 'North',
    Mumbai: 'West', Ahmedabad: 'West', Pune: 'West',
    Kolkata: 'East', Guwahati: 'East', Bhubaneswar: 'East',
    Chennai: 'South', Bengaluru: 'South', Hyderabad: 'South', Thiruvananthapuram: 'South',
  }
  return map[station] || 'North'
}

function mockGet(uid) {
  return MOCK_PROFILES.get(uid) || null
}

export async function createUserProfile({ uid, fullName, email, role, station, department, empId, title, expertise, experience }) {
  const now = new Date().toISOString()
  const data = {
    uid,
    fullName,
    email,
    role,
    approvalStatus: 'PENDING',
    station: station || '',
    region: regionFor(station),
    organization: 'India Meteorological Department',
    department: department || '',
    empId: empId || '',
    title: title || '',
    expertise: expertise || [],
    specializations: [],
    skills: [],
    qualifications: [],
    professionalSummary: '',
    yearsOfExperience: experience || '',
    trainingInterests: [],
    achievements: [],
    certifications: [],
    photoURL: '',
    createdAt: now,
    updatedAt: now,
    profileCompletion: profileCompletionFor({
      fullName,
      title: title || '',
      station: station || '',
      region: regionFor(station),
      professionalSummary: '',
      skills: [],
      expertise: expertise || [],
      qualifications: [],
      certifications: [],
    }),
  }
  MOCK_PROFILES.set(uid, {
      ...data,
      createdAt: now,
      updatedAt: now,
    })
  return data
}

export async function getUserProfile(uid) {
  return mockGet(uid)
}

// Profile editing must never be able to touch identity / permission fields.
// Only the profile editor and certification flows are permitted to mutate a
// user's professional data; role, approvalStatus, uid and auth-controlled email
// are stripped here at the service layer.
const PROTECTED_KEYS = new Set(['role', 'approvalStatus', 'uid', 'email'])

export async function updateUserProfile(uid, patch) {
  const safePatch = { ...patch }
  for (const k of PROTECTED_KEYS) delete safePatch[k]

  // Normalize array fields so the editor always saves arrays.
  for (const k of [
    'skills',
    'qualifications',
    'expertise',
    'specializations',
    'trainingInterests',
    'achievements',
    'certifications',
  ]) {
    if (Array.isArray(safePatch[k])) safePatch[k] = safePatch[k].filter(Boolean)
    else if (safePatch[k] !== undefined) delete safePatch[k]
  }

  if (!MOCK_PROFILES.has(uid)) return getUserProfile(uid)
  const current = MOCK_PROFILES.get(uid)
  const merged = { ...current, ...safePatch }
  MOCK_PROFILES.set(uid, {
    ...merged,
    profileCompletion: profileCompletionFor(merged),
    updatedAt: new Date().toISOString(),
  })
  return getUserProfile(uid)
}

// ---------------------------------------------------------------------------
// CERTIFICATION MANAGEMENT
// ---------------------------------------------------------------------------
export async function addCertification(uid, cert) {
  const certification = {
    id: cert.id,
    title: cert.title,
    issuingOrganization: cert.issuingOrganization,
    issueDate: cert.issueDate,
    expiryDate: cert.expiryDate || '',
    credentialId: cert.credentialId || '',
    credentialUrl: cert.credentialUrl || '',
    fileURL: cert.fileURL || '',
    fileType: cert.fileType || '',
    createdAt: new Date().toISOString(),
  }
  const user = await getUserProfile(uid)
  const certifications = Array.isArray(user?.certifications) ? user.certifications : []
  await updateUserProfile(uid, { certifications: [...certifications, certification] })
  return certification
}

export async function updateCertification(uid, certificationId, data) {
  const user = await getUserProfile(uid)
  const certifications = Array.isArray(user?.certifications) ? user.certifications : []
  const next = certifications.map((c) =>
    c.id === certificationId ? { ...c, ...data, id: c.id, createdAt: c.createdAt } : c,
  )
  await updateUserProfile(uid, { certifications: next })
  return getUserProfile(uid)
}

export async function removeCertification(uid, certificationId) {
  const user = await getUserProfile(uid)
  const certifications = Array.isArray(user?.certifications) ? user.certifications : []
  const next = certifications.filter((c) => c.id !== certificationId)
  await updateUserProfile(uid, { certifications: next })
  return getUserProfile(uid)
}

// ---------------------------------------------------------------------------
// FILE UPLOAD ARCHITECTURE
// ---------------------------------------------------------------------------
// File blobs in this mock path go to Cloudinary (NOT Firebase Storage); only the
// Cloudinary URL / public_id / metadata is attached to the user record. When
// Cloudinary is not configured we produce a temporary in-memory object URL for
// the current page session only — it is never persisted to localStorage and
// does not pretend to be permanent storage.

const MOCK_BLOB_URLS = new Map()

function blobUrlFor(file) {
  let url = MOCK_BLOB_URLS.get(`${file.name}:${file.size}:${file.lastModified}`)
  if (!url) {
    url = URL.createObjectURL(file)
    MOCK_BLOB_URLS.set(`${file.name}:${file.size}:${file.lastModified}`, url)
  }
  return url
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

export async function uploadProfilePhoto(uid, file) {
  if (!file) return getUserProfile(uid)
  const imageErr = validateImageFile(file)
  if (imageErr) throw new Error(imageErr)
  let photoURL
  let publicId = ''
  if (isCloudinaryConfigured()) {
    const result = await uploadToCloudinary(file, {
      folder: `profiles/${uid}`,
      publicId: `photo.${extOf(file.name)}`,
      resourceType: 'image',
      metadata: { uploadedBy: uid, purpose: 'profile-photo' },
    })
    photoURL = result.fileURL
    publicId = result.public_id
  } else {
    // MOCK / DEVELOPMENT ONLY — temporary in-memory preview, never persisted.
    photoURL = blobUrlFor(file)
    publicId = ''
  }
  await updateUserProfile(uid, { photoURL, photoPublicId: publicId })
  return getUserProfile(uid)
}

export async function uploadCertificationFile(uid, certificationId, file) {
  if (!file) return getUserProfile(uid)
  const type = file.type || extOf(file.name)
  let fileURL
  let publicId = ''
  if (isCloudinaryConfigured()) {
    const result = await uploadToCloudinary(file, {
      folder: `profiles/${uid}/certifications`,
      publicId: `${certificationId}.${extOf(file.name)}`,
      metadata: { uploadedBy: uid, certificationId, purpose: 'certification' },
    })
    fileURL = result.fileURL
    publicId = result.public_id
  } else {
    // MOCK / DEVELOPMENT ONLY — temporary in-memory object URL, never persisted.
    fileURL = blobUrlFor(file)
    publicId = ''
  }
  await updateCertification(uid, certificationId, { fileURL, fileType: type, publicId })
  return getUserProfile(uid)
}

export async function getPendingUsers() {
  return [...MOCK_PROFILES.values()].filter((u) => u.approvalStatus === 'PENDING')
}

export async function getAllUsers() {
  return [...MOCK_PROFILES.values()]
}

// Public-safe directory used for cross-platform search (trainers/trainees).
// Returns only non-sensitive professional fields — never credentials. Includes
// every approved role (TRAINER, TRAINEE, ADMIN) as well as the rich capability
// fields (skills, specializations, qualifications) so search can match a user by
// capability as well as by name / designation / station / domain expertise.
export async function getSearchableUsers() {
  const all = await getAllUsers()
  return all
    .filter((u) => String(u.approvalStatus || '').toUpperCase() === 'APPROVED')
    .map((u) => ({
      uid: u.uid,
      name: u.fullName || u.name,
      role: u.role,
      title: u.title || '',
      station: u.station || '',
      region: u.region || '',
      expertise: Array.isArray(u.expertise) ? u.expertise : [],
      specializations: Array.isArray(u.specializations) ? u.specializations : [],
      skills: Array.isArray(u.skills) ? u.skills : [],
      qualifications: Array.isArray(u.qualifications) ? u.qualifications : [],
      organization: u.organization || '',
      photoURL: u.photoURL || '',
    }))
}

// Only ADMIN callers should reach these through AuthContext; the frontend
// enforces that role check (the mock store has no data-layer rules to lean on).
export async function setApprovalStatus(uid, status) {
  if (MOCK_PROFILES.has(uid)) {
    MOCK_PROFILES.set(uid, {
      ...MOCK_PROFILES.get(uid),
      approvalStatus: status,
      updatedAt: new Date().toISOString(),
    })
  }
  return getUserProfile(uid)
}

export const approveUser = (uid) => setApprovalStatus(uid, 'APPROVED')
export const rejectUser = (uid) => setApprovalStatus(uid, 'REJECTED')

// Role change is an ADMIN-only operation. The frontend guards the caller.
export async function setUserRole(uid, role) {
  if (MOCK_PROFILES.has(uid)) {
    MOCK_PROFILES.set(uid, {
      ...MOCK_PROFILES.get(uid),
      role,
      updatedAt: new Date().toISOString(),
    })
  }
  return getUserProfile(uid)
}
