import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { seedCompetencyRecords, stationRegionMap } from '../data/mockData'
import { useAuth } from './AuthContext'
import * as courseService from '../services/courseService'
import { ownedTrainerIds } from '../utils/trainerOwnership'
import * as courseApi from '../services/courseApi'
import * as enrollmentApi from '../services/enrollmentApi'
import * as certificateApi from '../services/certificateApi'
import * as userApi from '../services/userApi'

const CourseContext = createContext(null)

export function CourseProvider({ children }) {
  const { currentUser } = useAuth()

  // Stateful course catalog — the reactive in-memory store for this session.
  // Initialized from the service's (mock) data source.
  const [courses, setCourses] = useState(() => seedCoursesSnapshot())

  const backendActive = Boolean(currentUser && currentUser.authSource === 'supabase')

  // Load the course catalog for the current user. Real (supabase) users read the
  // authoritative backend (trainees see only PUBLISHED courses; trainers/admins
  // see every course they are entitled to). Trainer-owned courses are hydrated
  // with their sections + question bank so the course-management UI keeps
  // working against persisted data. The in-memory dev-mock path is unchanged.
  useEffect(() => {
    if (!currentUser) return
    if (backendActive) {
      let active = true
      setCourses([])
      ;(async () => {
        try {
          const queries = currentUser.role === 'TRAINEE' ? { status: 'PUBLISHED' } : {}
          const payload = await courseApi.listCourses(queries)
          const list = Array.isArray(payload?.courses) ? payload.courses : []
          const mapped = list.map(courseApi.mapCourseFromApi)

          const owned =
            currentUser.role === 'TRAINER' && (currentUser.status === 'approved' || currentUser.approvalStatus === 'APPROVED')
              ? mapped.filter((c) => String(c.trainerId) === String(currentUser.id))
              : []
          for (const c of owned) {
            try {
              const [sections, questions] = await Promise.all([
                courseApi.listSections(c.id).catch(() => []),
                courseApi.listQuestions(c.id).catch(() => []),
              ])
              applySectionsToCourse(c, sections)
              c.bank = (Array.isArray(questions) ? questions : []).map(courseApi.mapQuestionFromApi)
            } catch {
              /* keep course without hydrated content */
            }
          }

          mapped.forEach((c) => {
            if (String(c.trainerId) === String(currentUser.id)) c.trainer = currentUser.name || currentUser.fullName || ''
          })
          if (currentUser.status === 'approved' || currentUser.approvalStatus === 'APPROVED') {
            const peerIds = [...new Set(mapped.filter((c) => !c.trainer && c.trainerId).map((c) => c.trainerId))]
            const results = await Promise.allSettled(peerIds.map((id) => userApi.getUser(id)))
            const names = new Map()
            results.forEach((r, i) => {
              if (r.status === 'fulfilled') {
                const u = r.value?.user
                names.set(peerIds[i], u?.name || u?.fullName || '')
              }
            })
            mapped.forEach((c) => {
              if (!c.trainer) c.trainer = names.get(c.trainerId) || ''
            })
          }

          if (active) setCourses(mapped)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[CourseContext] Failed to load courses from backend:', err.message)
          if (active) setCourses([])
        }
      })()
      return () => {
        active = false
      }
    }
    let active = true
    courseService
      .getAllCourses(currentUser)
      .then((list) => {
        if (active) setCourses(list)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] Failed to load courses from the mock store:', err.message)
      })
    return () => {
      active = false
    }
  }, [currentUser, backendActive])

  // User-scoped enrollments (traineeId + trainerId + courseId) which also carry
  // the course certificate once a course is completed. Seeded from the service's
  // (mock) data source.
  const [enrollments, setEnrollments] = useState(() => courseService._enrollmentsSeed())

  // Load the caller's enrollments. Real (supabase) users read the authoritative
  // backend enrollment rows; trainers additionally pull full rows (assessment +
  // feedback) and issued certificates so the trainer course workspace stays
  // complete. The in-memory dev-mock path is unchanged.
  useEffect(() => {
    if (!currentUser) return
    if (backendActive) {
      let active = true
      setEnrollments([])
      syncEnrollments()
        .catch(() => {
          if (active) setEnrollments([])
        })
      return () => {
        active = false
      }
    }
    let active = true
    courseService
      .getEnrollments(currentUser)
      .then((list) => {
        if (active) setEnrollments(list)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] Failed to load enrollments from the mock store:', err.message)
      })
    return () => {
      active = false
    }
  }, [currentUser, backendActive, syncEnrollments])

  // Backend trainer dashboards show live enrolled counts per course; reconcile
  // them from the role-scoped backend enrollment rows when those rows change.
  useEffect(() => {
    if (!backendActive || currentUser?.role !== 'TRAINER') return
    const owned = ownedTrainerIds(currentUser.id)
    const counts = enrollments.reduce((acc, e) => {
      if (owned.has(e.trainerId)) acc[e.courseId] = (acc[e.courseId] || 0) + 1
      return acc
    }, {})
    setCourses((prev) =>
      prev.length ? prev.map((c) => ({ ...c, enrolled: counts[c.id] || 0 })) : prev,
    )
  }, [enrollments, backendActive, currentUser])

  // Competency records aggregated from completed courses for admin/regional data.
  const [competencyRecords, setCompetencyRecords] = useState(() =>
    seedCompetencyRecords.map((c) => ({ ...c })),
  )

  const syncEnrollments = useCallback(async () => {
    const rows = await enrollmentApi.listEnrollments()
    const list = Array.isArray(rows) ? rows : []
    let enriched = list.map(courseApi.mapEnrollmentFromApi)
    if (currentUser?.role === 'TRAINER') {
      const [fullRows, certRows] = await Promise.all([
        Promise.all(list.slice(0, 100).map((r) => enrollmentApi.getEnrollment(r.id).catch(() => null))),
        certificateApi.listCertificates().catch(() => []),
      ])
      enriched = fullRows.filter(Boolean).map(courseApi.mapEnrollmentFromApi)
      const certList = Array.isArray(certRows) ? certRows : []
      const byEnrollment = new Map(certList.map((ct) => [String(ct.enrollmentId), ct]))
      enriched.forEach((e) => {
        const ct = byEnrollment.get(String(e.id))
        if (ct) {
          e.certificate = { id: ct.id, issuedOn: ct.issuedOn || null, certificateNumber: ct.certificateNumber || null }
          if (ct.traineeName) e.traineeName = ct.traineeName
        }
      })
    }
    setEnrollments((prev) => (prev === enriched ? prev : enriched))
  }, [currentUser])

  function sectionBucket(sectionType) {
    return courseApi.sectionKeyForType(sectionType) || 'notes'
  }

  function applySectionsToCourse(target, sections) {
    const byType = { notes: [], slides: [], videos: [], practice: [] }
    ;(Array.isArray(sections) ? sections : []).forEach((s) => {
      byType[sectionBucket(s.sectionType)].push(courseApi.mapSectionFromApi(s))
    })
    target.notes = byType.notes
    target.slides = byType.slides
    target.videos = byType.videos
    target.practice = byType.practice
  }

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

  const enroll = async (courseId) => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return false
    const course = courseById(courseId)
    if (!course || (course.status !== 'published' && course.status !== 'featured')) return false
    if (getEnrollment(courseId)) return false
    if (backendActive) {
      try {
        await enrollmentApi.enroll(courseId)
        await syncEnrollments()
        return true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] enroll failed:', err.message)
        return false
      }
    }
    try {
      const created = await courseService.createEnrollment(currentUser, {
        courseId,
        courseTitle: course.title,
        trainerId: course.trainerId,
      })
      if (created) setEnrollments((prev) => {
        const next = prev.filter((e) => !(e.courseId === courseId && e.traineeId === created.traineeId))
        return [...next, created]
      })
      return !!created
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CourseContext] enroll failed:', err.message)
      return false
    }
  }

  const updateEnrollment = (courseId, patch) => {
    if (!currentUser || currentUser.role !== 'TRAINEE' || currentUser.status !== 'approved') return
    // Persist through the service (mock store) while mirroring
    // into React state so the workspace updates live. Callers treat this as
    // fire-and-forget; failures are logged, never surfaced mid-interaction.
    courseService
      .updateEnrollmentRecord(currentUser, courseId, patch)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] updateEnrollment failed:', err.message)
      })
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

  // ---- Certificates (role-scoped views over enrollments that carry one) ----
  // A certificate exists exactly when an enrollment has `certificate` set and
  // the enrollment is completed. These views enforce the ownership rules on top
  // of whatever the service layer loaded, so:
  //   - TRAINEE sees only their own certificates
  //   - TRAINER sees only certificates for courses they own
  //   - ADMIN sees every completed certificate
  const myCertificates = useMemo(
    () =>
      enrollments.filter(
        (e) => e.certificate && e.status === 'completed' && e.traineeId === (currentUser?.id || currentUser?.uid),
      ),
    [enrollments, currentUser],
  )

  const courseCertificates = useMemo(() => {
    if (currentUser?.role !== 'TRAINER') return []
    const owned = ownedTrainerIds(currentUser.id)
    return enrollments.filter(
      (e) => e.certificate && e.status === 'completed' && owned.has(e.trainerId),
    )
  }, [enrollments, currentUser])

  const allCertificates = useMemo(
    () => enrollments.filter((e) => e.certificate && e.status === 'completed'),
    [enrollments],
  )

  const createCourse = async (data) => {
    if (!currentUser) return null
    if (backendActive) {
      try {
        const created = await courseApi.createCourse(data)
        const mapped = courseApi.mapCourseFromApi(created)
        mapped.trainer = currentUser.name || currentUser.fullName || ''
        setCourses((prev) => [mapped, ...prev.filter((c) => c.id !== mapped.id)])
        return mapped
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] createCourse failed:', err.message)
        throw err
      }
    }
    try {
      const created = await courseService.createCourse(currentUser, data)
      if (created) setCourses((prev) => [created, ...prev])
      return created
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CourseContext] createCourse failed:', err.message)
      throw err
    }
  }

  const updateCourse = async (id, patch) => {
    if (!currentUser) return null
    if (backendActive) {
      try {
        const updated = await courseApi.updateCourse(id, patch)
        const mapped = courseApi.mapCourseFromApi(updated)
        mapped.trainer = currentUser.name || currentUser.fullName || ''
        setCourses((prev) => prev.map((c) => (c.id === id ? mapped : c)))
        return mapped
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] updateCourse failed:', err.message)
        return null
      }
    }
    return run(() => {
      const updated = courseService.updateCourse(currentUser, id, patch)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === id ? updated : c)))
      return updated
    })
  }

  const deleteCourse = async (id) => {
    if (backendActive) {
      try {
        await courseApi.deleteCourse(id)
        setCourses((prev) => prev.filter((c) => c.id !== id))
        setEnrollments((prev) => prev.filter((e) => e.courseId !== id))
        return true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] deleteCourse failed:', err.message)
        return false
      }
    }
    return run(() => {
      const ok = courseService.deleteCourse(currentUser, id)
      if (ok) {
        setCourses((prev) => prev.filter((c) => c.id !== id))
        setEnrollments((prev) => prev.filter((e) => e.courseId !== id))
        courseService.removeCourseEnrollments(id)
      }
      return ok
    })
  }

  // Attempt to publish. Returns { ok, errors, warnings } based on readiness so
  // the UI can render validation messages. For backend users the server re-validates
  // the question-bank gate (>= MIN_VALID_QUESTIONS valid questions) and rejects
  // with QUESTION_BANK_READY when the bank is short.
  const publishCourse = async (id) => {
    const course = courseById(id)
    if (!course) return { ok: false, errors: ['Course not found.'] }
    const readiness = courseService.courseReadiness(course)
    if (backendActive) {
      if (!readiness.ok) {
        return { ok: false, errors: readiness.errors, warnings: readiness.warnings }
      }
      try {
        const updated = await courseApi.updateCourse(id, { status: 'PUBLISHED' })
        setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'published', publishedAt: updated.publishedAt } : c)))
        return { ok: true, errors: [], warnings: readiness.warnings }
      } catch (err) {
        return { ok: false, errors: [err?.message || 'The course could not be published.'], warnings: readiness.warnings }
      }
    }
    return run(() => {
      if (!readiness.ok) {
        return { ok: false, errors: readiness.errors, warnings: readiness.warnings }
      }
      const published = courseService.setCourseStatus(currentUser, id, 'published')
      if (published) setCourses((prev) => prev.map((c) => (c.id === id ? published : c)))
      return { ok: true, errors: [], warnings: readiness.warnings }
    })
  }

  // Backward-compatible toggle (draft <-> published) routed through the service.
  const togglePublish = async (id) => {
    const course = courseById(id)
    if (!course) return
    const next = course.status === 'published' || course.status === 'featured' ? 'draft' : 'published'
    if (backendActive) {
      try {
        const updated = await courseApi.updateCourse(id, { status: next === 'published' ? 'PUBLISHED' : 'DRAFT' })
        setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, status: next, publishedAt: updated.publishedAt } : c)))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] togglePublish failed:', err.message)
      }
      return
    }
    return run(() => {
      const updated = courseService.setCourseStatus(currentUser, id, next)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === id ? updated : c)))
    })
  }

  // ---- Question Bank CRUD (owned by a single course) ----

  const refreshQuestionBank = async (courseId) => {
    try {
      const questions = await courseApi.listQuestions(courseId)
      const bank = (Array.isArray(questions) ? questions : []).map(courseApi.mapQuestionFromApi)
      setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, bank } : c)))
      return bank
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CourseContext] refreshQuestionBank failed:', err.message)
      return []
    }
  }

  const addQuestion = async (courseId, q) => {
    if (backendActive) {
      try {
        await courseApi.addQuestion(courseId, q)
        await refreshQuestionBank(courseId)
        return true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] addQuestion failed:', err.message)
        return false
      }
    }
    return run(() => {
      const added = courseService.addQuestion(currentUser, courseId, q)
      const updated = courseService.getCourse(courseId)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
      return added
    })
  }

  const updateQuestion = async (courseId, qid, patch) => {
    if (backendActive) {
      try {
        await courseApi.updateQuestion(courseId, qid, patch)
        await refreshQuestionBank(courseId)
        return true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] updateQuestion failed:', err.message)
        return false
      }
    }
    return run(() => {
      courseService.updateQuestion(currentUser, courseId, qid, patch)
      const updated = courseService.getCourse(courseId)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    })
  }

  const deleteQuestion = async (courseId, qid) => {
    if (backendActive) {
      try {
        await courseApi.deleteQuestion(courseId, qid)
        await refreshQuestionBank(courseId)
        return true
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CourseContext] deleteQuestion failed:', err.message)
        return false
      }
    }
    return run(() => {
      const updated = courseService.deleteQuestion(currentUser, courseId, qid)
      if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    })
  }

  // ---- Content-section management (notes / slides / videos / practice) ----

  const SECTION_TYPE_BY_KEY = { notes: 'NOTES', slides: 'SLIDES', videos: 'VIDEOS', practice: 'PRACTICE' }

  const sectionApiType = (sectionKey) => SECTION_TYPE_BY_KEY[sectionKey] || 'NOTES'

  const refreshCourseSections = async (courseId) => {
    const sections = await courseApi.listSections(courseId)
    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== courseId) return c
        const next = { ...c }
        applySectionsToCourse(next, sections)
        return next
      }),
    )
    return sections
  }

  const escalateManuallyAddedContent = async (courseId, section, item) => {
    const course = courseById(courseId)
    const existing = course?.[section]?.find((s) => s.storagePath && s.storagePath === item.storagePath)
    if (existing) return existing
    await courseApi.addSection(courseId, {
      sectionType: sectionApiType(section),
      orderIndex: course?.[section]?.length ?? 0,
      title: item.name || item.title || 'Material',
    })
    await refreshCourseSections(courseId)
    return null
  }

  const syncCourse = (courseId) => {
    if (backendActive) {
      refreshCourseSections(courseId).catch(() => {})
      return undefined
    }
    const updated = courseService.getCourse(courseId)
    if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    return updated
  }

  const addContent = async (courseId, section, item) => {
    if (backendActive) {
      const entry = await escalateManuallyAddedContent(courseId, section, item)
      return entry || item
    }
    const entry = await courseService.addContentItem(currentUser, courseId, section, item)
    syncCourse(courseId)
    return entry
  }

  const updateContent = async (courseId, section, itemId, patch) => {
    if (backendActive) {
      await refreshCourseSections(courseId)
      return undefined
    }
    const updated = await courseService.updateContentItem(currentUser, courseId, section, itemId, patch)
    if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    return updated
  }

  const removeContent = async (courseId, section, itemId) => {
    if (backendActive) {
      const course = courseById(courseId)
      const item = course?.[section]?.find((s) => s.id === itemId)
      if (!item && itemId) {
        await refreshCourseSections(courseId)
        return undefined
      }
      await courseApi.removeSection(courseId, itemId)
      await refreshCourseSections(courseId)
      return undefined
    }
    const updated = await courseService.removeContentItem(currentUser, courseId, section, itemId)
    if (updated) setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)))
    return updated
  }

  const uploadCourseFile = async (courseId, folder, file) => {
    if (backendActive) {
      const course = courseById(courseId)
      await courseApi.uploadSection(
        courseId,
        {
          sectionType: sectionApiType(folder),
          orderIndex: course?.[folder]?.length ?? 0,
          title: file.name,
        },
        file,
      )
      await refreshCourseSections(courseId)
      return true
    }
    return courseService.uploadCourseFile(currentUser, courseId, folder, file)
  }

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
      // certificates
      myCertificates,
      courseCertificates,
      allCertificates,
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
