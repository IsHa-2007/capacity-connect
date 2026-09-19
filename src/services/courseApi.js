import {
  api,
  ApiError,
  getAccessToken,
  API_BASE_URL,
  API_PREFIX,
} from './api.js'

const auth = () => ({ token: getAccessToken() })

// ---------------------------------------------------------------------------
// ENUM MAPPING (backend frozen enums <-> legacy UI values)
// ---------------------------------------------------------------------------

const COURSE_DIFFICULTY_TO_API = {
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  advanced: 'ADVANCED',
}

export function difficultyToApi(value) {
  const key = String(value || '').trim().toLowerCase()
  return COURSE_DIFFICULTY_TO_API[key] || (key ? key.toUpperCase() : undefined)
}

export function difficultyFromApi(value) {
  const key = String(value || '').toLowerCase()
  if (!key) return ''
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function statusFromApi(value, isFeatured) {
  if (isFeatured) return 'featured'
  return String(value || 'DRAFT').toLowerCase()
}

const SECTION_TYPE_TO_KEY = {
  NOTES: 'notes',
  SLIDES: 'slides',
  VIDEOS: 'videos',
  PRACTICE: 'practice',
}

export function sectionKeyForType(sectionType) {
  return SECTION_TYPE_TO_KEY[sectionType] || null
}

// ---------------------------------------------------------------------------
// ROW MAPPERS (backend -> legacy UI shape)
// ---------------------------------------------------------------------------

export function mapCourseFromApi(c) {
  return {
    id: c.id,
    trainerId: c.trainerId,
    trainer: c.trainerName || '',
    title: c.title,
    description: c.description || '',
    domain: c.domain || '',
    subdomain: '',
    audience: '',
    difficulty: difficultyFromApi(c.difficulty),
    duration: c.duration || '4 weeks',
    objectives: Array.isArray(c.objectives) ? [...c.objectives] : [],
    syllabus: Array.isArray(c.syllabus) ? [...c.syllabus] : [],
    prerequisites: [],
    tags: Array.isArray(c.tags) ? [...c.tags] : [],
    rating: 0,
    status: statusFromApi(c.status, c.isFeatured),
    isFeatured: Boolean(c.isFeatured),
    publishedAt: c.publishedAt || null,
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null,
    enrolled: 0,
    bank: [],
    notes: [],
    slides: [],
    videos: [],
    practice: [],
  }
}

export function mapSectionFromApi(s) {
  const name = s.originalFilename || s.title || 'Material'
  return {
    id: s.id,
    sectionType: s.sectionType,
    type: s.sectionType,
    name,
    title: s.title || name,
    fileType: s.mimeType || 'file',
    fileURL: s.signedUrl || null,
    size: s.fileSize || 0,
    storagePath: s.storagePath || null,
    publicId: s.storagePath || '',
    addedAt: s.createdAt || null,
  }
}

export function mapQuestionFromApi(q) {
  return {
    id: q.id,
    courseId: q.courseId,
    text: q.text,
    options: Array.isArray(q.options) ? [...q.options] : [],
    answer: q.correctOptionIndex,
    difficulty: String(q.difficulty || 'EASY').toLowerCase(),
    topic: q.topic || q.tagLabel || '',
    tag: { text: q.topic || q.tagLabel || '' },
    isValid: Boolean(q.is_valid),
  }
}

export function questionToApi(q) {
  return {
    text: q.text,
    difficulty: String(q.difficulty || 'easy').toUpperCase(),
    topic: q.topic || (q.tag && q.tag.text) || '',
    options: Array.isArray(q.options) ? q.options : [],
    correctOptionIndex: Number(q.answer),
    tagLabel: q.tagLabel || q.topic || (q.tag && q.tag.text) || '',
  }
}

export function mapEnrollmentFromApi(e) {
  const assessment = e.assessment || null
  let stage = 'notes'
  if (assessment?.passed) stage = e.feedback ? 'certificate' : 'feedback'
  else if ((e.progress || 0) >= 75) stage = 'assessment'
  else if ((e.progress || 0) >= 25) stage = 'practice'
  else if ((e.progress || 0) > 0) stage = 'notes'
  return {
    id: e.id,
    traineeId: e.userId,
    userId: e.userId,
    courseId: e.courseId,
    trainerId: e.trainerId,
    status: String(e.status || 'ENROLLED').toLowerCase(),
    progress: e.progress || 0,
    stage,
    startedOn: e.startedAt ? String(e.startedAt).slice(0, 10) : null,
    completedAt: e.completedAt || null,
    notesDone: false,
    slidesDone: false,
    videoDone: false,
    practiceDone: false,
    assessment,
    feedback: e.feedback || null,
    certificate: null,
    attempts: e.assessment?.attemptsCount || 0,
  }
}

// ---------------------------------------------------------------------------
// WRITE PAYLOADS
// ---------------------------------------------------------------------------

export function createCoursePayload(data) {
  return {
    title: data.title,
    domain: data.domain,
    description: data.description,
    difficulty: difficultyToApi(data.difficulty),
    duration: data.duration,
    objectives: data.objectives,
    syllabus: data.syllabus,
    tags: data.tags,
    status: data.status === 'published' || data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    isFeatured: data.isFeatured,
  }
}

export function updateCoursePayload(patch) {
  const out = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.domain !== undefined) out.domain = patch.domain
  if (patch.description !== undefined) out.description = patch.description
  if (patch.difficulty !== undefined) out.difficulty = difficultyToApi(patch.difficulty)
  if (patch.duration !== undefined) out.duration = patch.duration
  if (patch.objectives !== undefined) out.objectives = patch.objectives
  if (patch.syllabus !== undefined) out.syllabus = patch.syllabus
  if (patch.tags !== undefined) out.tags = patch.tags
  if (patch.status !== undefined) {
    out.status = patch.status === 'published' || patch.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
  }
  if (patch.isFeatured !== undefined) out.isFeatured = Boolean(patch.isFeatured)
  return out
}

// ---------------------------------------------------------------------------
// COURSES
// ---------------------------------------------------------------------------

export async function listCourses({ status, trainerId } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (trainerId) params.set('trainerId', trainerId)
  const qs = params.toString()
  return api.get(`/courses${qs ? `?${qs}` : ''}`, auth())
}

export async function getCourse(id) {
  return api.get(`/courses/${id}`, auth())
}

export async function createCourse(data) {
  return api.post('/courses', createCoursePayload(data), auth())
}

export async function updateCourse(id, patch) {
  return api.patch(`/courses/${id}`, updateCoursePayload(patch), auth())
}

export async function deleteCourse(id) {
  return api.del(`/courses/${id}`, auth())
}

// ---------------------------------------------------------------------------
// COURSE SECTIONS
// ---------------------------------------------------------------------------

export async function listSections(courseId) {
  return api.get(`/courses/${courseId}/sections`, auth())
}

export async function addSection(courseId, body) {
  return api.post(`/courses/${courseId}/sections`, body, auth())
}

export async function removeSection(courseId, sectionId) {
  return api.del(`/courses/${courseId}/sections/${sectionId}`, auth())
}

// Multipart upload through the Multer pipeline (FormData, never JSON-coded).
export async function uploadSection(courseId, { sectionType, orderIndex = 0, title }, file) {
  const token = getAccessToken()
  const form = new FormData()
  form.append('sectionType', sectionType)
  form.append('orderIndex', String(orderIndex))
  if (title) form.append('title', title)
  form.append('file', file)

  let response
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}/courses/${courseId}/sections/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
  } catch (err) {
    throw new Error('Unable to reach the API. Is the backend running?', { cause: err })
  }

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  if (!response.ok) {
    const apiError = json?.error
    throw new ApiError(apiError?.message || 'The upload failed.', {
      status: response.status,
      code: apiError?.code || 'REQUEST_FAILED',
      details: apiError?.details,
    })
  }
  return json?.data ?? null
}

// ---------------------------------------------------------------------------
// QUESTION BANK
// ---------------------------------------------------------------------------

export async function listQuestions(courseId) {
  return api.get(`/courses/${courseId}/questions`, auth())
}

export async function addQuestion(courseId, question) {
  return api.post(`/courses/${courseId}/questions`, questionToApi(question), auth())
}

export async function updateQuestion(courseId, questionId, patch) {
  return api.patch(`/courses/${courseId}/questions/${questionId}`, questionToApi(patch), auth())
}

export async function deleteQuestion(courseId, questionId) {
  return api.del(`/courses/${courseId}/questions/${questionId}`, auth())
}