import { createContext, useContext, useMemo, useState } from 'react'
import { seedEnrollments, seedCompetencyRecords, stationRegionMap } from '../data/mockData'
import { useAuth } from './AuthContext'
import * as courseService from '../services/courseService'
import { ownedTrainerIds } from '../utils/trainerOwnership'

const CourseContext = createContext(null)

export function CourseProvider({ children }) {
  const { currentUser } = useAuth()

  // Stateful course catalog — the reactive in-memory store for this session.
  // Initialized from the service's (mock or Firestore) data source.
  const [courses, setCourses] = useState(() => seedCoursesSnapshot())

  // User-scoped enrollments with traineeId + trainerId.
  const [enrollments, setEnrollments] = useState(() =>
    seedEnrollments.map((e) => ({ ...e })),
  )

  // Competency records aggregated from completed courses for admin/regional data.
  const [competencyRecords, setCompetencyRecords] = useState(() =>
    seedCompetencyRecords.map((c) => ({ ...c })),
  )

  const isApprovedTrainer =
    currentUser?.role === 'TRAINER' &&
    (currentUser.status === 'approved' || currentUser.approvalStatus === 'APPROVED')

  const courseById = (id) => courses.find((c) => c.id === id)

  // Apply a course mutation to local state only after the service layer
  // allowed it (ownership + approved-trainer enforcement lives in the service).
  const run = (fn) => {
    try {
      return fn()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CourseContext] operation rejected:', err.message)
      return null
    }
  }

  // ---- Enrollments (scoped to current trainee user) ----

  const getEnrollment = (courseId) => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return null
    return enrollments.find((e) => e.courseId === courseId && e.traineeId === currentUser.id)
  }

  const myEnrollments = useMemo(() => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return []
    return enrollments.filter((e) => e.traineeId === currentUser.id)
  }, [enrollments, currentUser])

  const enroll = (courseId) => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return false
    const course = courseById(courseId)
    if (!course || (course.status !== 'published' && course.status !== 'featured')) return false
    if (getEnrollment(courseId)) return false
    const next = [
      ...enrollments,
      {
        id: `en${Date.now()}`,
        traineeId: currentUser.id,
        trainerId: course.trainerId,
        courseId,
        status: 'inprogress',
        progress: 5,
        stage: 'notes',
        startedOn: new Date().toISOString().slice(0, 10),
        notesDone: false,
        slidesDone: false,
        videoDone: false,
        practiceDone: false,
        assessment: null,
        feedback: null,
        certificate: null,
        attempts: 0,
      },
    ]
    setEnrollments(next)
    return true
  }

  const updateEnrollment = (courseId, patch) => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return
    setEnrollments((prev) =>
      prev.map((e) =>
        e.courseId === courseId && e.traineeId === currentUser.id ? { ...e, ...patch } : e,
      ),
    )
  }

  // When a trainee completes a course (certificate generated), add/refresh the
  // competency record so admin + regional analytics reflect real completion.
  const recordCompetency = (courseId, score) => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return
    const course = courseById(courseId)
    if (!course) return
    const existing = competencyRecords.find(
      (r) => r.traineeId === currentUser.id && r.courseId === courseId,
    )
    if (existing) {
      setCompetencyRecords((prev) =>
        prev.map((r) =>
          r.courseId === courseId && r.traineeId === currentUser.id
            ? { ...r, competency: score }
            : r,
        ),
      )
    } else {
      setCompetencyRecords((prev) => [
        ...prev,
        {
          traineeId: currentUser.id,
          traineeName: currentUser.name,
          station: currentUser.station,
          domain: course.domain,
          competency: score,
          courseId,
        },
      ])
    }
  }

  // ---- Trainer course management ----

  const myCourses = useMemo(() => {
    if (!isApprovedTrainer) return []
    const owned = ownedTrainerIds(currentUser.id)
    return courses.filter((c) => owned.has(c.trainerId))
  }, [courses, currentUser, isApprovedTrainer])

  // Derive enrolled trainees for a course from real enrollment records.
  const traineesForCourse = (courseId) =>
    enrollments.filter((e) => e.courseId === courseId)

  const createCourse = (data) =>
    run(() => {
      const created = courseService.createCourse(currentUser, data)
      setCourses((prev) => [created, ...prev])
      return created
    })

  const updateCourse = (id, patch) =>
    run(() => {
      const updated = courseService.updateCourse(currentUser, id, patch)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === id ? updated : c)))
      return updated
    })

  const deleteCourse = (id) =>
    run(() => {
      const ok = courseService.deleteCourse(currentUser, id)
      if (ok) {
        setCourses((prev) => prev.filter((c) => c.id !== id))
        setEnrollments((prev) => prev.filter((e) => e.courseId !== id))
      }
      return ok
    })

  // Attempt to publish. Returns { ok, errors, warnings } based on readiness so
  // the UI can render validation messages. Ownership/approved enforced upstream.
  const publishCourse = (id) =>
    run(() => {
      const course = courseById(id)
      if (!course) return { ok: false, errors: ['Course not found.'] }
      const readiness = courseService.courseReadiness(course)
      if (!readiness.ok) {
        return { ok: false, errors: readiness.errors, warnings: readiness.warnings }
      }
      const published = courseService.setCourseStatus(currentUser, id, 'published')
      if (published) setCourses((prev) => prev.map((c) => (c.id === id ? published : c)))
      return { ok: true, errors: [], warnings: readiness.warnings }
    })

  // Backward-compatible toggle (draft <-> published) routed through the service.
  const togglePublish = (id) =>
    run(() => {
      const course = courseById(id)
      if (!course) return
      const next = course.status === 'published' || course.status === 'featured' ? 'draft' : 'published'
      const updated = courseService.setCourseStatus(currentUser, id, next)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === id ? updated : c)))
    })

  // ---- Question Bank CRUD (owned by a single course) ----

  const addQuestion = (courseId, q) =>
    run(() => {
      const added = courseService.addQuestion(currentUser, courseId, q)
      const updated = courseService.getCourse(courseId)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
      return added
    })

  const updateQuestion = (courseId, qid, patch) =>
    run(() => {
      courseService.updateQuestion(currentUser, courseId, qid, patch)
      const updated = courseService.getCourse(courseId)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    })

  const deleteQuestion = (courseId, qid) =>
    run(() => {
      const updated = courseService.deleteQuestion(currentUser, courseId, qid)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    })

  // ---- Content-section management (notes / slides / videos / practice) ----

  const syncCourse = (courseId) => {
    const updated = courseService.getCourse(courseId)
    if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    return updated
  }

  const addContent = async (courseId, section, item) => {
    const entry = await courseService.addContentItem(currentUser, courseId, section, item)
    syncCourse(courseId)
    return entry
  }

  const updateContent = async (courseId, section, itemId, patch) => {
    const updated = await courseService.updateContentItem(currentUser, courseId, section, itemId, patch)
    if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    return updated
  }

  const removeContent = async (courseId, section, itemId) => {
    const updated = await courseService.removeContentItem(currentUser, courseId, section, itemId)
    if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    return updated
  }

  const uploadCourseFile = (courseId, folder, file) =>
    courseService.uploadCourseFile(currentUser, courseId, folder, file)

  // ---- Legacy helpers mapped onto the content model ----
  // (kept so existing trainer UI continues to work; new UI uses addContent.)

  const addMaterial = (courseId, material) => addContent(courseId, 'notes', material)
  const removeMaterial = (courseId, index) => {
    const course = courseById(courseId)
    const item = course?.notes?.[index]
    if (item) return removeContent(courseId, 'notes', item.id)
  }

  const addSlide = (courseId, slide) => addContent(courseId, 'slides', slide)
  const removeSlide = (courseId, index) => {
    const course = courseById(courseId)
    const item = course?.slides?.[index]
    if (item) return removeContent(courseId, 'slides', item.id)
  }

  const addVideo = (courseId, video) => addContent(courseId, 'videos', video)
  const removeVideo = (courseId, index) => {
    const course = courseById(courseId)
    const item = course?.videos?.[index]
    if (item) return removeContent(courseId, 'videos', item.id)
  }

  const addPractice = (courseId, item) => addContent(courseId, 'practice', item)
  const removePractice = (courseId, index) => {
    const course = courseById(courseId)
    const item = course?.practice?.[index]
    if (item) return removeContent(courseId, 'practice', item.id)
  }

  const value = useMemo(
    () => ({
      enrollments,
      myEnrollments,
      courseCatalog: courses.filter((c) => c.status === 'published' || c.status === 'featured'),
      courses,
      competencyRecords,
      stationRegionMap,
      courseById,
      courseReadiness: courseService.courseReadiness,
      getEnrollment,
      enroll,
      updateEnrollment,
      recordCompetency,
      // trainer
      myCourses,
      traineesForCourse,
      createCourse,
      updateCourse,
      deleteCourse,
      togglePublish,
      publishCourse,
      // question bank
      addQuestion,
      updateQuestion,
      deleteQuestion,
      // content sections
      addContent,
      updateContent,
      removeContent,
      uploadCourseFile,
      // legacy material/slide/video/practice helpers
      addMaterial,
      removeMaterial,
      addSlide,
      removeSlide,
      addVideo,
      removeVideo,
      addPractice,
      removePractice,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrollments, courses, competencyRecords, currentUser, isApprovedTrainer],
  )

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>
}

export const useCourses = () => useContext(CourseContext)

// Synchronous snapshot of the seed catalog for initial state (mock store is
// shared in-memory, so created/published courses survive navigation within a
// page session but are lost on a full reload — development-only behaviour).
function seedCoursesSnapshot() {
  let seeded = null
  try {
    seeded = courseService._mockSeed()
  } catch {
    seeded = null
  }
  return seeded
}
