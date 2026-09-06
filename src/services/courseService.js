// Course service layer for CAPACITY CONNECT.
//
// All course persistence, ownership checks and question-bank/material/content
// operations live here. UI components must NOT mutate courses directly.
//
// Architecture mirrors userService.js:
//   - When Firebase is configured, courses persist to Firestore 'courses' and
//     file blobs upload to Cloudinary (NOT Firebase Storage). In that (rare)
//     case the functions return Promises.
//   - When Firebase is NOT configured, we fall back to an isolated in-memory
//     mock store so the platform remains runnable in development. These mock
//     operations are SYNCHRONOUS and return the resulting object directly so
//     the UI can navigate/act immediately. The mock is EXPLICITLY development-
//     only, does NOT use localStorage, and is never advertised as production
//     persistence.

import { collection, doc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { isFirebaseConfigured, getFirebase } from '../firebase/config'
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  courseFolderError,
  isCloudinaryConfigured,
} from './cloudinaryService'
import { courses as seedCourses, seedEnrollments } from '../data/mockData'
import { ownedTrainerIds } from '../utils/trainerOwnership'

// ---------------------------------------------------------------------------
// ACCESS CONTROL
// ---------------------------------------------------------------------------
// Only APPROVED TRAINERS may perform operational course actions, and only on
// courses they OWN. These guards are enforced here (single service choke point)
// and mirrored in firestore.rules for the Firestore data layer.
export function canManageCourse(actor, course) {
  if (!actor) return false
  if (actor.role !== 'TRAINER') return false
  if (actor.status !== 'approved' && actor.approvalStatus !== 'APPROVED') return false
  if (!course) return false
  const ownerId = course.trainerId || course.trainer
  return ownerId === actor.id || ownerId === actor.uid
}

function assertCanManage(actor, course) {
  if (!canManageCourse(actor, course)) throw new Error('Unauthorized: only an approved Trainer who owns this course may modify it.')
}

// ---------------------------------------------------------------------------
// MOCK / DEVELOPMENT-ONLY store
// ---------------------------------------------------------------------------
function cloneSeed(c) {
  // Prefer the content.<section> map when present (Firestore write shape used by
  // addContentItem/updateContentItem) so reloaded courses keep their material;
  // fall back to the legacy top-level arrays used by the seed/mock data.
  const pick = (key) => {
    const fromContent = c.content?.[key]
    return Array.isArray(fromContent) ? fromContent : Array.isArray(c[key]) ? c[key] : []
  }
  return {
    ...c,
    objectives: Array.isArray(c.objectives) ? [...c.objectives] : [],
    syllabus: Array.isArray(c.syllabus) ? [...c.syllabus] : [],
    tags: Array.isArray(c.tags) ? [...c.tags] : [],
    prerequisites: Array.isArray(c.prerequisites) ? [...c.prerequisites] : [],
    bank: Array.isArray(c.bank) ? c.bank.map((q) => ({ ...q, tag: q.tag ? { ...q.tag } : q.tag })) : [],
    notes: pick('notes').map((x) => ({ ...x })),
    slides: pick('slides').map((x) => ({ ...x })),
    videos: pick('videos').map((x) => ({ ...x })),
    practice: pick('practice').map((x) => ({ ...x })),
  }
}

const MOCK_COURSES = new Map(seedCourses.map((c) => [c.id, cloneSeed(c)]))

function mockGet(id) {
  return MOCK_COURSES.get(id) || null
}

// Synchronous snapshot of the current mock catalog (used to seed the reactive
// store in CourseContext). READ-ONLY — do not mutate outside the service.
export function _mockSeed() {
  return [...MOCK_COURSES.values()].map((c) => cloneSeed(c))
}

// ---------------------------------------------------------------------------
// FILE UPLOAD ARCHITECTURE
// ---------------------------------------------------------------------------
// Production: files are uploaded to Cloudinary (NOT Firebase Storage). Only the
// Cloudinary URL / public_id / metadata is written to the course record. Without
// Cloudinary credentials we produce a temporary in-memory object URL for the
// current page session only (never persisted, never localStorage).
const MOCK_BLOB_URLS = new Map()

function blobUrlFor(file) {
  const key = `${file.name}:${file.size}:${file.lastModified}`
  let url = MOCK_BLOB_URLS.get(key)
  if (!url) {
    url = URL.createObjectURL(file)
    MOCK_BLOB_URLS.set(key, url)
  }
  return url
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

// Validate a file against the allowed formats for a course folder. Returns an
// error message string, or null when the file is allowed. Single source of truth
// lives in cloudinaryService.courseFolderError; this re-export keeps the existing
// UI import working without duplicating the format rules.
export function forFolderError(folder, file) {
  return courseFolderError(folder, file)
}

function safeToken(seed) {
  return (seed || 'f') + '-' + Math.random().toString(36).slice(2, 10)
}

// Upload a file for a course content item. `folder` is one of notes/slides/
// videos/practice. Returns { fileURL, fileType, storagePath } where storagePath
// is the Cloudinary public_id (used for cleanup tracking).
export async function uploadCourseFile(actor, courseId, folder, file) {
  if (!file) return null
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const err = courseFolderError(folder, file)
  if (err) throw new Error(err)
  const ext = extOf(file.name)

  if (isCloudinaryConfigured()) {
    const result = await uploadToCloudinary(file, {
      // Namespace by courseId + folder so Course A files never collide with
      // Course B files, and they remain grouped in the Cloudinary media library.
      //
      // Cloudinary CONCATENATES `folder` + `public_id` into the final asset
      // public_id, so public_id MUST be the plain file name — never repeat the
      // folder segment here. Repeating it (e.g. publicId `notes/xx.pdf` with
      // folder `.../notes`) produces broken double paths like
      // `courses/<id>/notes/notes/xx.pdf` and corrupts every stored file URL.
      folder: `courses/${courseId}/${folder}`,
      publicId: `${safeToken('m')}.${ext}`,
      metadata: { courseId, uploadedBy: actor.id || actor.uid, folder },
    })
    return {
      fileURL: result.fileURL,
      fileType: result.fileType || file.type || ext,
      storagePath: result.storagePath || result.public_id,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes,
    }
  }

  // MOCK / DEVELOPMENT ONLY — temporary in-memory object URL, session-only.
  const fileURL = blobUrlFor(file)
  return { fileURL, fileType: file.type || ext, storagePath: `mock:courses/${courseId}/${folder}` }
}

// Remove the stored object (best-effort) when removing a material.
// Cloudinary unsigned uploads cannot be destroyed from the browser without the
// API secret; we track the public_id so a backend/Console routine can clean up.
export function removeStoredFile(storagePath) {
  if (!storagePath || storagePath.startsWith('mock:')) return
  void deleteFromCloudinary(storagePath)
}

// ---------------------------------------------------------------------------
// COURSE CRUD
// ---------------------------------------------------------------------------
export function getCourse(id) {
  return mockGet(id)
}

export function createCourse(actor, data) {
  if (!actor || actor.role !== 'TRAINER' || (actor.status !== 'approved' && actor.approvalStatus !== 'APPROVED')) {
    throw new Error('Unauthorized: only an approved Trainer may create courses.')
  }
  if (isFirebaseConfigured()) return createCourseFirestore(actor, data)
  const id = data.id || `c${safeToken('crs')}`
  const now = new Date().toISOString()
  const status = data.status === 'published' ? 'published' : 'draft'
  const course = {
    id,
    title: data.title,
    description: data.description || '',
    domain: data.domain,
    subdomain: data.subdomain || '',
    difficulty: data.difficulty || 'Beginner',
    duration: data.duration || '4 weeks',
    audience: data.audience || '',
    objectives: Array.isArray(data.objectives) ? data.objectives : [],
    syllabus: Array.isArray(data.syllabus) ? data.syllabus : [],
    prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    trainerId: actor.id || actor.uid,
    trainer: actor.name || actor.fullName || '',
    trainerName: actor.name || actor.fullName || '',
    status,
    enrolled: 0,
    completion: 0,
    rating: 0,
    bank: [],
    notes: [],
    slides: [],
    videos: [],
    practice: [],
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
  }
  MOCK_COURSES.set(id, cloneSeed(course))
  return mockGet(id)
}

async function createCourseFirestore(actor, data) {
  const { db } = getFirebase()
  const id = data.id || `c${safeToken('crs')}`
  const status = data.status === 'published' ? 'published' : 'draft'
  const now = serverTimestamp()
  const course = {
    ...data,
    id,
    trainerId: actor.id || actor.uid,
    trainerName: actor.name || actor.fullName || '',
    status,
    enrolled: 0,
    completion: 0,
    rating: 0,
    notes: [],
    slides: [],
    videos: [],
    practice: [],
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
  }
  await setDoc(doc(db, 'courses', id), course)
  // Keep the local reactive store in sync so subsequent in-session content /
  // question-bank operations on this course work exactly like the mock path.
  const local = { ...course, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: status === 'published' ? new Date().toISOString() : null }
  MOCK_COURSES.set(id, cloneSeed(local))
  return mockGet(id)
}

// Load the course catalog from Firestore when Firebase is configured. Also
// hydrates the in-memory store so the mock paths (mockGet, canManageCourse,
// content/question-bank ops) operate on the real persisted documents rather
// than only the seed data. Falls back to the seed catalog when not configured.
export async function getAllCourses(actor) {
  if (!isFirebaseConfigured()) return _mockSeed()
  const { db } = getFirebase()
  const isTrainee = actor?.role === 'TRAINEE'
  // TRAINEE accounts are permitted (by firestore.rules) to read only docs whose
  // status is 'published', so scope the query exactly to that status to avoid
  // a permission-denied failure of the whole catalog read.
  const ref = isTrainee
    ? query(collection(db, 'courses'), where('status', '==', 'published'))
    : collection(db, 'courses')
  const snap = await getDocs(ref)
  // Firestore stores createdAt/publishedAt (and updatedAt set with
  // serverTimestamp) as Timestamp objects; normalize to ISO strings so the app
  // code sees the same date type as the mock path.
  const toIso = (t) => (t && typeof t.toDate === 'function' ? t.toDate().toISOString() : t || null)
  const list = snap.docs.map((d) => {
    const c = cloneSeed({ ...d.data(), id: d.id })
    c.createdAt = toIso(c.createdAt)
    c.updatedAt = toIso(c.updatedAt)
    c.publishedAt = toIso(c.publishedAt)
    MOCK_COURSES.set(c.id, c)
    return c
  })
  return list
}

export function updateCourse(actor, courseId, patch) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    const safe = { ...patch }
    delete safe.trainerId
    delete safe.trainer
    delete safe.id
    void updateDoc(doc(db, 'courses', courseId), { ...safe, updatedAt: serverTimestamp() })
  }
  // Never allow a caller to reassign ownership.
  const safe = { ...patch }
  delete safe.trainerId
  delete safe.trainer
  delete safe.id
  MOCK_COURSES.set(courseId, { ...course, ...safe, updatedAt: new Date().toISOString() })
  return mockGet(courseId)
}

export function deleteCourse(actor, courseId) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    void deleteDoc(doc(db, 'courses', courseId))
  }
  MOCK_COURSES.delete(courseId)
  return true
}

export function setCourseStatus(actor, courseId, status) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const next = status === 'published' ? 'published' : 'draft'
  const now = isFirebaseConfigured() ? serverTimestamp() : new Date().toISOString()
  const patch = { status: next, publishedAt: next === 'published' ? now : null, updatedAt: now }
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    void updateDoc(doc(db, 'courses', courseId), patch)
  }
  MOCK_COURSES.set(courseId, { ...course, ...patch })
  return mockGet(courseId)
}

// ---------------------------------------------------------------------------
// CONTENT-SECTION CRUD (notes / slides / videos / practice)
// ---------------------------------------------------------------------------
const CONTENT_KEYS = ['notes', 'slides', 'videos', 'practice']

function contentOf(course) {
  return {
    notes: Array.isArray(course?.notes) ? course.notes : [],
    slides: Array.isArray(course?.slides) ? course.slides : [],
    videos: Array.isArray(course?.videos) ? course.videos : [],
    practice: Array.isArray(course?.practice) ? course.practice : [],
  }
}

function applyContent(course, next) {
  return { ...course, notes: next.notes, slides: next.slides, videos: next.videos, practice: next.practice }
}

export function addContentItem(actor, courseId, section, item) {
  if (!CONTENT_KEYS.includes(section)) throw new Error('Invalid content section.')
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const content = contentOf(course)
  const entry = {
    id: `m${safeToken('m')}`,
    ...item,
    section,
    // Prefer an explicit publicId; otherwise derive from storagePath (the
    // Cloudinary public_id returned by uploadCourseFile) so Firestore metadata
    // always carries a publicId usable for later cleanup.
    publicId: item.publicId || (typeof item.storagePath === 'string' && !item.storagePath.startsWith('mock:') ? item.storagePath : ''),
  }
  const next = { ...content, [section]: [...(content[section] || []), entry] }
  const updated = applyContent(course, next)
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    void updateDoc(doc(db, 'courses', courseId), { [`content.${section}`]: next[section], updatedAt: serverTimestamp() })
  }
  MOCK_COURSES.set(courseId, { ...updated, updatedAt: new Date().toISOString() })
  return entry
}

export function updateContentItem(actor, courseId, section, itemId, patch) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const content = contentOf(course)
  const sectionArr = content[section] || []
  const nextArr = sectionArr.map((it) => (it.id === itemId ? { ...it, ...patch, id: it.id, section } : it))
  const next = { ...content, [section]: nextArr }
  const updated = applyContent(course, next)
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    void updateDoc(doc(db, 'courses', courseId), { [`content.${section}`]: nextArr, updatedAt: serverTimestamp() })
  }
  MOCK_COURSES.set(courseId, { ...updated, updatedAt: new Date().toISOString() })
  return mockGet(courseId)
}

export function removeContentItem(actor, courseId, section, itemId) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const content = contentOf(course)
  const sectionArr = content[section] || []
  const removed = sectionArr.find((it) => it.id === itemId)
  const nextArr = sectionArr.filter((it) => it.id !== itemId)
  const next = { ...content, [section]: nextArr }
  const updated = applyContent(course, next)
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    void updateDoc(doc(db, 'courses', courseId), { [`content.${section}`]: nextArr, updatedAt: serverTimestamp() })
  }
  MOCK_COURSES.set(courseId, { ...updated, updatedAt: new Date().toISOString() })
  if (removed?.storagePath) removeStoredFile(removed.storagePath)
  return mockGet(courseId)
}

// ---------------------------------------------------------------------------
// QUESTION BANK (tied to an individual course)
// ---------------------------------------------------------------------------
const DIFFICULTIES = ['easy', 'medium', 'hard']

function normalizeQuestion(q) {
  if (!q.text || !String(q.text).trim()) throw new Error('Question text is required.')
  const options = Array.isArray(q.options) ? q.options : []
  if (options.length < 2) throw new Error('A question needs at least two options.')
  const answer = Number(q.answer)
  if (!(answer >= 0 && answer < options.length) && options[answer] === undefined) {
    throw new Error('A valid correct answer is required.')
  }
  if (!DIFFICULTIES.includes(q.difficulty)) throw new Error("Difficulty must be easy, medium or hard.")
  return {
    id: q.id || `q${safeToken('q')}`,
    text: String(q.text).trim(),
    options: options.map((o) => String(o)),
    answer,
    difficulty: q.difficulty,
    topic: q.topic || '',
    tag: q.tag || null,
    courseId: q.courseId || '',
  }
}

function persistBank(courseId, course, bank) {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    void updateDoc(doc(db, 'courses', courseId), { bank, updatedAt: serverTimestamp() })
  }
  MOCK_COURSES.set(courseId, { ...course, bank, updatedAt: new Date().toISOString() })
  return mockGet(courseId)
}

export function addQuestion(actor, courseId, q) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const question = normalizeQuestion({ ...q, courseId })
  const bank = Array.isArray(course.bank) ? course.bank : []
  persistBank(courseId, course, [...bank, question])
  return question
}

export function updateQuestion(actor, courseId, questionId, patch) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const existing = (course.bank || []).find((x) => x.id === questionId)
  if (!existing) throw new Error('Question not found.')
  const question = normalizeQuestion({ ...existing, ...patch, id: existing.id, courseId })
  const nextBank = (course.bank || []).map((x) => (x.id === questionId ? question : x))
  persistBank(courseId, course, nextBank)
  return mockGet(courseId)
}

export function deleteQuestion(actor, courseId, questionId) {
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const nextBank = (course.bank || []).filter((x) => x.id !== questionId)
  return persistBank(courseId, course, nextBank)
}

// ---------------------------------------------------------------------------
// PUBLISH VALIDATION (readiness)
// ---------------------------------------------------------------------------
// A question is considered "valid" for publishing only if it carries a real
// question text and at least two options with a selectable correct answer.
export function isValidQuestion(q) {
  if (!q || !String(q?.text || '').trim()) return false
  const options = Array.isArray(q?.options) ? q.options : []
  if (options.length < 2) return false
  const answer = Number(q.answer)
  if (Number.isNaN(answer)) return false
  if (answer < 0 || answer >= options.length) return false
  return true
}

// Minimum valid questions required in a course's Question Bank before the course
// can be published. Questions from other courses are never counted.
export const MIN_VALID_QUESTIONS = 5

export function courseReadiness(course) {
  const errors = []
  const warnings = []
  if (!course?.title || !String(course.title).trim()) errors.push('Course title is required.')
  if (!course?.description || !String(course.description).trim()) errors.push('Course description is required.')
  if (!course?.domain) errors.push('A scientific domain is required.')

  // NOTE: Publishing intentionally does NOT require every content category.
  // Trainers may publish a course and then enrich its material (study notes,
  // slide decks, video lectures, practice sets) at their own pace.
  const content = contentOf(course)
  const totalMaterials =
    (content.notes || []).length +
    (content.slides || []).length +
    (content.videos || []).length +
    (content.practice || []).length

  if (totalMaterials < 1) {
    warnings.push(
      'No learning material has been added yet. The course can be published, but trainees will see empty sections until you add study notes, slides, videos or practice sets.',
    )
  }

  // Publishing is BLOCKED until the course Question Bank holds at least the
  // minimum number of VALID questions (MIN_VALID_QUESTIONS = 5). Only questions
  // belonging to this course (from `course.bank`) are counted; incomplete
  // questions and any global/demo questions are excluded.
  const bank = Array.isArray(course?.bank) ? course.bank : []
  const validBank = bank.filter(isValidQuestion)
  if (validBank.length < MIN_VALID_QUESTIONS) {
    errors.push(
      `Add at least ${MIN_VALID_QUESTIONS} valid assessment questions before publishing this course. ` +
        `Current valid questions: ${validBank.length}. Each question needs text, at least two options, and a selected correct answer.`,
    )
  }

  const countFor = (d) => validBank.filter((q) => q.difficulty === d).length
  const easy = countFor('easy')
  const medium = countFor('medium')
  const hard = countFor('hard')
  if (easy < 1 || medium < 1 || hard < 1) {
    warnings.push(
      `The Question Bank has no ${[['easy', easy], ['medium', medium], ['hard', hard]].filter(([, n]) => n < 1).map(([d]) => d).join('/')} question. A balanced 20:30:50 assessment gives a richer test — consider adding questions across all three difficulty levels.`,
    )
  }
  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// ENROLLMENTS & CERTIFICATES
// ---------------------------------------------------------------------------
// Trainee enrollments carry the course certificate inside the SAME document
// (fields: traineeId, trainerId, courseId, status, assessment, feedback,
// certificate). A completed certificate exists exactly when `certificate` is set
// and `status === 'completed'`. Keeping certificates on the enrollment (rather
// than a separate collection) avoids a parallel certificate system and lets the
// access rules reuse the project's existing enrollment ownership fields.
//
// Access model (mirrored in firestore.rules):
//   - TRAINEE reads/writes ONLY their own enrollments (traineeId == auth.uid)
//   - TRAINER reads ONLY enrollments whose trainerId == auth.uid (course owner)
//   - ADMIN reads ALL enrollments (and therefore all certificates)

const MOCK_ENROLLMENTS = new Map(
  seedEnrollments.map((e) => [`${e.courseId}:${e.traineeId}`, cloneEnrollment(e)]),
)

function cloneEnrollment(e) {
  return {
    ...e,
    assessment: e.assessment ? { ...e.assessment } : null,
    feedback: e.feedback ? { ...e.feedback } : null,
    certificate: e.certificate ? { ...e.certificate } : null,
  }
}

// Synchronous snapshot of the current in-memory enrollment catalog for seeding
// the reactive store in CourseContext. READ-ONLY — do not mutate outside the
// service. (Development-only when Firebase is not configured.)
export function _enrollmentsSeed() {
  return [...MOCK_ENROLLMENTS.values()].map((e) => cloneEnrollment(e))
}

function enrollmentKey(courseId, traineeId) {
  return `${courseId}:${traineeId}`
}

function assertTrainee(actor) {
  if (!actor || actor.role !== 'TRAINEE' || (actor.status !== 'approved' && actor.approvalStatus !== 'APPROVED')) {
    throw new Error('Unauthorized: only an approved Trainee may manage their own enrollments.')
  }
}

// Load enrollments scoped to the caller, exactly as firestore.rules permits:
// trainee → own records only; trainer → records for courses they own; admin →
// all records. When Firebase is not configured, falls back to the in-memory
// store. Also hydrates the in-memory map so mock helpers stay consistent.
export async function getEnrollments(actor) {
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    const uid = actor?.id || actor?.uid
    let ref
    if (actor?.role === 'TRAINEE') {
      ref = query(collection(db, 'enrollments'), where('traineeId', '==', uid))
    } else if (actor?.role === 'TRAINER') {
      // Trainer (course owner) reads only enrollments on courses they own.
      ref = query(collection(db, 'enrollments'), where('trainerId', '==', uid))
    } else {
      // ADMIN: all completed/in-progress enrollments across all courses.
      ref = collection(db, 'enrollments')
    }
    const snap = await getDocs(ref)
    return snap.docs.map((d) => {
      const e = cloneEnrollment({ ...d.data(), id: d.id })
      MOCK_ENROLLMENTS.set(enrollmentKey(e.courseId, e.traineeId), cloneEnrollment(e))
      return cloneEnrollment(e)
    })
  }

  const all = [...MOCK_ENROLLMENTS.values()]
  if (!actor) return all.map((e) => cloneEnrollment(e))
  const uid = actor.id || actor.uid
  if (actor.role === 'TRAINEE') return all.filter((e) => e.traineeId === uid).map((e) => cloneEnrollment(e))
  if (actor.role === 'TRAINER') {
    const owned = ownedTrainerIds(uid)
    return all.filter((e) => owned.has(e.trainerId)).map((e) => cloneEnrollment(e))
  }
  return all.map((e) => cloneEnrollment(e))
}

// Create an enrollment for the current trainee. Persists to Firestore when
// configured, otherwise to the in-memory store. Returns the created enrollment
// (with an id) so the UI can render immediately.
export async function createEnrollment(actor, data) {
  assertTrainee(actor)
  const now = new Date().toISOString()
  const enrollment = {
    id: data.id || `en${safeToken('enr')}`,
    traineeId: actor.id || actor.uid,
    traineeName: actor.name || actor.fullName || '',
    courseId: data.courseId,
    courseTitle: data.courseTitle || '',
    trainerId: data.trainerId,
    status: 'inprogress',
    progress: 5,
    stage: 'notes',
    startedOn: now.slice(0, 10),
    notesDone: false,
    slidesDone: false,
    videoDone: false,
    practiceDone: false,
    assessment: null,
    feedback: null,
    certificate: null,
    attempts: 0,
  }
  MOCK_ENROLLMENTS.set(enrollmentKey(enrollment.courseId, enrollment.traineeId), cloneEnrollment(enrollment))
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    await setDoc(doc(db, 'enrollments', enrollment.id), enrollment)
  }
  return cloneEnrollment(enrollment)
}

// Merge a patch into the caller's own enrollment (progress, assessment,
// feedback, certificate, status). Identity fields (traineeId/trainerId/courseId)
// are preserved and can never be changed through this function, matching the
// firestore.rules constraints for trainee updates.
export async function updateEnrollmentRecord(actor, courseId, patch) {
  assertTrainee(actor)
  const uid = actor.id || actor.uid
  const current = MOCK_ENROLLMENTS.get(enrollmentKey(courseId, uid)) || (await mockEnrollmentFromFirestore(courseId, uid))
  if (!current) throw new Error('Enrollment not found.')
  const next = cloneEnrollment({
    ...current,
    ...patch,
    traineeId: current.traineeId,
    trainerId: current.trainerId,
    courseId: current.courseId,
  })
  MOCK_ENROLLMENTS.set(enrollmentKey(courseId, uid), next)
  if (isFirebaseConfigured()) {
    const { db } = getFirebase()
    await updateDoc(doc(db, 'enrollments', current.id), { ...patch, updatedAt: serverTimestamp() })
  }
  return next
}

async function mockEnrollmentFromFirestore(courseId, uid) {
  if (!isFirebaseConfigured()) return null
  const { db } = getFirebase()
  // Single-field query (no composite index needed); the course filter happens
  // client-side on the caller's own records only. Rules samples each returned
  // doc, so never query with courseId alone (that would include other trainees'
  // docs and be denied).
  const q = query(collection(db, 'enrollments'), where('traineeId', '==', uid))
  const snap = await getDocs(q)
  const doc = snap.docs.find((d) => d.data().courseId === courseId)
  if (!doc) return null
  const e = cloneEnrollment({ ...doc.data(), id: doc.id })
  MOCK_ENROLLMENTS.set(enrollmentKey(courseId, uid), e)
  return e
}

// Prune in-memory enrollments when a course is deleted. Firestore enrollment
// deletes are intentionally NOT issued from the client because firestore.rules
// denies trainer-side deletion of enrollment documents (admin-only).
export function removeCourseEnrollments(courseId) {
  for (const key of [...MOCK_ENROLLMENTS.keys()]) {
    if (key.startsWith(`${courseId}:`)) MOCK_ENROLLMENTS.delete(key)
  }
}
