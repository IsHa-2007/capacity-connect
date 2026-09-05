// Firestore-backed user service for CAPACITY CONNECT.
//
// All Firestore access for user accounts, roles and approval status lives here.
// UI components must NOT query Firestore directly.
//
// When Firebase is not configured, these functions transparently fall back to a
// small in-memory mock store so the platform remains runnable during development.
// This fallback is EXPLICITLY a development convenience — it is not a real
// persistent backend and is never advertised as production. It does not use
// localStorage.

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { isFirebaseConfigured, getFirebase } from '../firebase/config'
import { users as seedUsers } from '../data/mockData'

// ---------------------------------------------------------------------------
// MOCK / DEVELOPMENT-ONLY note: when Firebase Storage is unavailable, uploaded
// files resolve to in-memory browser object URLs that live for the current page
// session only. They are NEVER written to localStorage and reset on reload,
// mirroring the in-memory mock behaviour used elsewhere in development.

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
  const now = serverTimestamp()
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
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    try {
      await setDoc(doc(db, 'users', uid), data)
      console.log('[userService] Firestore profile created for', uid)
    } catch (err) {
      console.error('[userService] Firestore setDoc FAILED:', err.code || err.message || err)
      throw err
    }
  } else {
    MOCK_PROFILES.set(uid, {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  return data
}

export async function getUserProfile(uid) {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return { uid: snap.id, ...snap.data() }
  }
  return mockGet(uid)
}

// Profile editing must never be able to touch identity / permission fields.
// Only the profile editor and certification flows are permitted to mutate a
// user's professional data; role, approvalStatus, uid and auth-controlled email
// are stripped here and also blocked by firestore.rules on the data layer.
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

  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    const snap = await getDoc(doc(db, 'users', uid))
    const current = snap.exists() ? snap.data() : {}
    const merged = { ...current, ...safePatch }
    await updateDoc(doc(db, 'users', uid), {
      ...safePatch,
      profileCompletion: profileCompletionFor(merged),
      updatedAt: serverTimestamp(),
    })
  } else if (MOCK_PROFILES.has(uid)) {
    const current = MOCK_PROFILES.get(uid)
    const merged = { ...current, ...safePatch }
    MOCK_PROFILES.set(uid, {
      ...merged,
      profileCompletion: profileCompletionFor(merged),
      updatedAt: new Date().toISOString(),
    })
  }
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
// Production: files go to Firebase Storage; only the download URL / metadata is
// written to Firestore. Without credentials we produce a temporary in-memory
// object URL for the current page session only — it is never persisted to
// localStorage and does not pretend to be permanent storage.

const MOCK_BLOB_URLS = new Map()

function blobUrlFor(file) {
  let url = MOCK_BLOB_URLS.get(`${file.name}:${file.size}:${file.lastModified}`)
  if (!url) {
    url = URL.createObjectURL(file)
    MOCK_BLOB_URLS.set(`${file.name}:${file.size}:${file.lastModified}`, url)
  }
  return url
}

export async function uploadProfilePhoto(uid, file) {
  if (!file) return getUserProfile(uid)
  if (isFirebaseConfigured()) {
    const { storage } = getFirebase()
    const fullRef = ref(storage, `profiles/${uid}/photo.${extOf(file.name)}`)
    await uploadBytes(fullRef, file)
    const photoURL = await getDownloadURL(fullRef)
    return updateUserProfile(uid, { photoURL })
  }
  // MOCK / DEVELOPMENT ONLY — temporary in-memory preview, never persisted.
  const photoURL = blobUrlFor(file)
  await updateUserProfile(uid, { photoURL })
  return getUserProfile(uid)
}

export async function uploadCertificationFile(uid, certificationId, file) {
  if (!file) return getUserProfile(uid)
  const type = file.type || extOf(file.name)
  if (isFirebaseConfigured()) {
    const { storage } = getFirebase()
    const fullRef = ref(storage, `profiles/${uid}/certifications/${certificationId}.${extOf(file.name)}`)
    await uploadBytes(fullRef, file)
    const fileURL = await getDownloadURL(fullRef)
    return updateCertification(uid, certificationId, { fileURL, fileType: type })
  }
  // MOCK / DEVELOPMENT ONLY — temporary in-memory object URL, never persisted.
  const fileURL = blobUrlFor(file)
  await updateCertification(uid, certificationId, { fileURL, fileType: type })
  return getUserProfile(uid)
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

export async function getPendingUsers() {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    const q = query(collection(db, 'users'), where('approvalStatus', '==', 'PENDING'))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
  }
  return [...MOCK_PROFILES.values()].filter((u) => u.approvalStatus === 'PENDING')
}

export async function getAllUsers() {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    const snap = await getDocs(collection(db, 'users'))
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
  }
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

// Only ADMIN callers should reach these. The frontend enforces the role check;
// Firestore security rules enforce it at the data layer (firestore.rules).
export async function setApprovalStatus(uid, status) {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    await updateDoc(doc(db, 'users', uid), { approvalStatus: status, updatedAt: serverTimestamp() })
  } else if (MOCK_PROFILES.has(uid)) {
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

// Role change is an ADMIN-only operation. The frontend guards the caller; Firestore
// security rules enforce it at the data layer (firestore.rules).
export async function setUserRole(uid, role) {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() })
  } else if (MOCK_PROFILES.has(uid)) {
    MOCK_PROFILES.set(uid, {
      ...MOCK_PROFILES.get(uid),
      role,
      updatedAt: new Date().toISOString(),
    })
  }
  return getUserProfile(uid)
}
