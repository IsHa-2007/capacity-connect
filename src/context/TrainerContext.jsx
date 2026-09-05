import { createContext, useContext, useMemo, useState } from 'react'
import { trainers } from '../data/mockData'
import { useAuth } from './AuthContext'
import { useCourses } from './CourseContext'
import { ownedTrainerIds } from '../utils/trainerOwnership'

const TrainerContext = createContext(null)

export function TrainerProvider({ children }) {
  const { currentUser } = useAuth()
  const {
    courses,
    enrollments,
    myCourses,
    courseById,
    traineesForCourse,
  } = useCourses()

  const [trainerList] = useState(trainers)
  const [notifications, setNotifications] = useState([])

  const addNotification = (n) =>
    setNotifications((prev) => [{ id: `n${Date.now()}`, read: false, ...n }, ...prev])

  const markAllNotificationsRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))

  // Trainees derived from real enrollment records across this trainer's courses.
  const trainees = useMemo(() => {
    if (!currentUser || currentUser.role !== 'TRAINER') return []
    const courseIds = new Set(
      courses.filter((c) => ownedTrainerIds(currentUser.id).has(c.trainerId)).map((c) => c.id),
    )
    return enrollments
      .filter((e) => courseIds.has(e.courseId))
      .map((e) => ({
        id: e.traineeId || e.id,
        courseId: e.courseId,
        progress: e.progress || 0,
        score: e.assessment?.percentage ?? null,
        attempts: e.attempts || 0,
        status: e.status === 'completed' ? 'completed' : 'inprogress',
        courseTitle: courseById(e.courseId)?.title || '',
        domain: courseById(e.courseId)?.domain || '',
        certification: !!e.certificate,
      }))
  }, [courses, enrollments, currentUser])

  // Trainer analytics computed from real enrollments + feedback.
  const analytics = useMemo(() => {
    if (currentUser?.role !== 'TRAINER') {
      return {
        courses: 0,
        activeTrainees: 0,
        completionRate: 0,
        avgAssessment: 0,
        avgProgress: 0,
        weakTopics: [],
        feedbackRatings: { contentDepth: 0, trainerDelivery: 0, operationalRelevance: 0 },
        feedbackCount: 0,
      }
    }
    const ids = new Set(myCourses.map((c) => c.id))
    const mine = enrollments.filter((e) => ids.has(e.courseId))
    const completed = mine.filter((e) => e.status === 'completed').length
    const withScore = mine.filter((e) => e.assessment)
    const avgAssessment = withScore.length
      ? withScore.reduce((s, e) => s + (e.assessment.percentage || 0), 0) / withScore.length
      : 0
    const avgProgress = mine.length
      ? mine.reduce((s, e) => s + (e.progress || 0), 0) / mine.length
      : 0

    // Aggregate feedback from submitted feedback objects
    const feedbacks = mine.filter((e) => e.feedback && (e.feedback.contentDepth || e.feedback.trainerDelivery))
    const sum = (k) => feedbacks.reduce((s, f) => s + (f.feedback[k] || 0), 0)
    const n = feedbacks.length || 1
    const feedbackRatings = {
      contentDepth: feedbacks.length ? sum('contentDepth') / n : 0,
      trainerDelivery: feedbacks.length ? sum('trainerDelivery') / n : 0,
      operationalRelevance: feedbacks.length ? sum('operationalRelevance') / n : 0,
    }

    // Weak topics: derive from bank questions answered incorrectly would need per-question
    // data; fall back to courses with low progress (most at risk).
    const weakTopics = mine
      .filter((e) => e.progress < 50)
      .map((e) => ({
        area: courseById(e.courseId)?.title || 'Unknown',
        pct: Math.round(e.progress),
      }))
      .slice(0, 4)

    return {
      courses: myCourses.length,
      activeTrainees: mine.length,
      completionRate: mine.length ? Math.round((completed / mine.length) * 100) : 0,
      avgAssessment: Math.round(avgAssessment),
      avgProgress: Math.round(avgProgress),
      weakTopics,
      feedbackRatings,
      feedbackCount: feedbacks.length,
      completed,
    }
  }, [currentUser, myCourses, enrollments, courseById])

  const value = useMemo(
    () => ({
      trainerList,
      trainees,
      analytics,
      notifications,
      addNotification,
      markAllNotificationsRead,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trainerList, trainees, analytics, notifications],
  )

  return <TrainerContext.Provider value={value}>{children}</TrainerContext.Provider>
}

export const useTrainer = () => useContext(TrainerContext)
