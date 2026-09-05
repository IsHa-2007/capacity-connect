// Course service layer for CAPACITY CONNECT.
//
// All course persistence, ownership checks and question-bank/material/content
// operations live here. UI components must NOT mutate courses directly.
//
// Architecture mirrors userService.js:
//   - When Firebase is configured, courses persist to Firestore 'courses' and
//     files to Firebase Storage. In that (rare) case the functions return
//     Promises.
//   - When Firebase is NOT configured, we fall back to an isolated in-memory
//     mock store so the platform remains runnable in development. These mock
//     operations are SYNCHRONOUS and return the resulting object directly so
//     the UI can navigate/act immediately. The mock is EXPLICITLY development-
//     only, does NOT use localStorage, and is never advertised as production
//     persistence.

import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { isFirebaseConfigured, getFirebase } from '../firebase/config'
import { courses as seedCourses } from '../data/mockData'

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
  return {
    ...c,
    objectives: Array.isArray(c.objectives) ? [...c.objectives] : [],
    syllabus: Array.isArray(c.syllabus) ? [...c.syllabus] : [],
    tags: Array.isArray(c.tags) ? [...c.tags] : [],
    prerequisites: Array.isArray(c.prerequisites) ? [...c.prerequisites] : [],
    bank: Array.isArray(c.bank) ? c.bank.map((q) => ({ ...q, tag: q.tag ? { ...q.tag } : q.tag })) : [],
    notes: Array.isArray(c.notes ?? c.content?.notes) ? (c.notes ?? c.content.notes).map((x) => ({ ...x })) : [],
    slides: Array.isArray(c.slides ?? c.content?.slides) ? (c.slides ?? c.content.slides).map((x) => ({ ...x })) : [],
    videos: Array.isArray(c.videos ?? c.content?.videos) ? (c.videos ?? c.content.videos).map((x) => ({ ...x })) : [],
    practice: Array.isArray(c.practice ?? c.content?.practice) ? (c.practice ?? c.content.practice).map((x) => ({ ...x })) : [],
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
// Production: files go to Firebase Storage under courses/{courseId}/{folder}/...
// Only the download URL / storage path / metadata is written to the course
// record. Without credentials we produce a temporary in-memory object URL for
// the current page session only (never persisted, never localStorage).
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

// Per-folder allowed formats (extension + MIME). Used to validate uploads so the
// app never relies only on the HTML `accept` attribute.
const FOLDER_FORMATS = {
  notes: {
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'],
    mime: (m) => m.includes('pdf') || m.startsWith('image/'),
  },
  slides: {
    exts: ['ppt', 'pptx'],
    mime: (m) => m.includes('presentation') || m.includes('powerpoint'),
  },
  videos: {
    exts: ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv'],
    mime: (m) => m.startsWith('video/'),
  },
  practice: {
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'txt'],
    mime: (m) => m.includes('pdf') || m.startsWith('image/') || m.includes('word') || m.includes('text') || m.includes('document'),
  },
}

// Validate a file against the allowed formats for a course folder. Returns an
// error message string, or null when the file is allowed.
export function forFolderError(folder, file) {
  if (!file) return null
  const rule = FOLDER_FORMATS[folder] || FOLDER_FORMATS.notes
  const ext = extOf(file.name)
  const mime = String(file.type || '').toLowerCase()
  const extOk = rule.exts.includes(ext)
  const mimeOk = rule.mime ? rule.mime(mime) : true
  if (extOk || mimeOk) return null
  const allowed = rule.exts.map((e) => e.toUpperCase()).join(', ')
  return `Unsupported file type. ${folderDisplay(folder)} accepts: ${allowed}.`
}

function folderDisplay(folder) {
  return { notes: 'Study Notes', slides: 'Slide Decks', videos: 'Video Lectures', practice: 'Practice Material' }[folder] || folder
}

function safeToken(seed) {
  return (seed || 'f') + '-' + Math.random().toString(36).slice(2, 10)
}

// Upload a file for a course content item. `folder` is one of notes/slides/
// videos/practice. Returns { fileURL, fileType, storagePath }.
export async function uploadCourseFile(actor, courseId, folder, file) {
  if (!file) return null
  const course = mockGet(courseId)
  assertCanManage(actor, course)
  const err = forFolderError(folder, file)
  if (err) throw new Error(err)
  const ext = extOf(file.name)

  if (isFirebaseConfigured()) {
    const { storage } = getFirebase()
    const fileRef = ref(storage, `courses/${courseId}/${folder}/${safeToken(file.name)}.${ext}`)
    await uploadBytes(fileRef, file)
    const fileURL = await getDownloadURL(fileRef)
    return { fileURL, fileType: file.type || ext, storagePath: fileRef.fullPath }
  }

  // MOCK / DEVELOPMENT ONLY — temporary in-memory object URL, session-only.
  const fileURL = blobUrlFor(file)
  return { fileURL, fileType: file.type || ext, storagePath: `mock:courses/${courseId}/${folder}` }
}

// Remove the stored object (best-effort) when removing a material.
export function removeStoredFile(storagePath) {
  if (!storagePath || !isFirebaseConfigured() || storagePath.startsWith('mock:')) return
  try {
    const { storage } = getFirebase()
    void deleteObject(ref(storage, storagePath))
  } catch {
    /* best-effort cleanup */
  }
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
  return { ...course, content: { notes: [], slides: [], videos: [], practice: [] } }
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
  const entry = { id: `m${safeToken('m')}`, ...item, section }
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
