import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  Award,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ClipboardCheck,
  FileCheck,
  LayoutDashboard,
  Layers,
  Lock,
  MessageSquare,
  PlayCircle,
  Presentation,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { Card, Badge } from '../common/ui'
import * as enrollmentApi from '../../services/enrollmentApi.js'
import NotesSection from './workspace/NotesSection'
import PPTSection from './workspace/PPTSection'
import VideoSection from './workspace/VideoSection'
import PracticeSection from './workspace/PracticeSection'
import QuizEngine from './workspace/QuizEngine'
import FeedbackModal from './workspace/FeedbackModal'
import CertificateView from './workspace/CertificateView'

// Static skeleton — material tabs are conditionally included based on whether
// the course actually has content in that section (see buildTabs below).
const BASE_TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'notes', label: 'Study Notes', icon: BookOpen, material: true },
  { key: 'slides', label: 'Slide Decks', icon: Presentation, material: true },
  { key: 'video', label: 'Video Lectures', icon: PlayCircle, material: true },
  { key: 'practice', label: 'Practice Sets', icon: ClipboardCheck, material: true },
  { key: 'assessment', label: 'Assessment', icon: FileCheck },
  { key: 'feedback', label: 'Feedback', icon: MessageSquare },
  { key: 'certificate', label: 'Certificate', icon: Award },
]

// Backend section_type -> workspace tab key (Module 11 section plan).
const SECTION_TAB_KEY = { NOTES: 'notes', SLIDES: 'slides', VIDEOS: 'video', PRACTICE: 'practice' }

// Backend "material" rows ({ id, type, mimeType, fileSize, originalFilename,
// signedUrl }) => the shape the material section components already use.
function toUiMaterial(m) {
  const name = m.originalFilename || m.originalName || 'Material'
  return {
    id: m.id,
    name,
    title: name,
    fileType: m.mimeType || m.type,
    type: m.type,
    size: m.fileSize,
    fileURL: m.signedUrl || null,
  }
}

function hasSubmittedFeedback(feedback) {
  return Boolean(
    feedback &&
      (feedback.contentDepth != null ||
        feedback.trainerDelivery != null ||
        feedback.operationalRelevance != null ||
        feedback.suggestions != null),
  )
}

export default function CourseWorkspace() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { courseCatalog, courseById } = useCourses()
  const [activeTab, setActiveTab] = useState('overview')
  const [showFeedback, setShowFeedback] = useState(false)
  const [assessmentNotice, setAssessmentNotice] = useState(false)
  const [notice, setNotice] = useState(null)
  const [enrollments, setEnrollments] = useState(null) // null = still loading
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)

  // The enrolled-courses list is backend-driven — the backend enrollment rows
  // are the single source for how much of each course has been completed.
  useEffect(() => {
    let cancelled = false
    enrollmentApi
      .listEnrollments()
      .then((rows) => {
        if (!cancelled) setEnrollments(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setEnrollments([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enrollmentsLoaded = enrollments !== null
  const enrollmentRow = courseId && enrollments ? enrollments.find((e) => String(e.courseId) === String(courseId)) : null
  const enrollmentId = enrollmentRow?.id || null
  // Workspace cache is keyed by enrollment id so switching between courses
  // never flashes another course's stale state.
  const [workspaces, setWorkspaces] = useState({})
  const workspace = enrollmentId ? workspaces[enrollmentId] || null : null

  // Load the authoritative workspace once the enrollment is known.
  useEffect(() => {
    if (!courseId || !enrollmentsLoaded || !enrollmentId) return
    let cancelled = false
    setLoadingWorkspace(true)
    enrollmentApi
      .getWorkspace(enrollmentId)
      .then((ws) => {
        if (!cancelled) setWorkspaces((prev) => (prev[enrollmentId] === ws ? prev : { ...prev, [enrollmentId]: ws }))
      })
      .catch((err) => {
        if (!cancelled) setNotice(err?.message || 'Could not load the workspace.')
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkspace(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, enrollmentsLoaded, enrollmentId])

  const refreshWorkspace = async () => {
    if (!enrollmentId) return
    try {
      const ws = await enrollmentApi.getWorkspace(enrollmentId)
      setWorkspaces((prev) => ({ ...prev, [enrollmentId]: ws }))
      setEnrollments((prev) =>
        Array.isArray(prev)
          ? prev.map((e) => (String(e.id) === String(enrollmentId) ? ws.enrollment : e))
          : prev,
      )
      return ws
    } catch (err) {
      setNotice(err?.message || 'Could not refresh your progress.')
      return null
    }
  }

  // No courseId selected → show the enrolled-courses card list.
  if (!courseId) {
    const enrolledCourses = courseCatalog
      .filter((c) => enrollmentsLoaded && enrollments.some((e) => String(e.courseId) === String(c.id)))
      .map((c) => {
        const row = enrollments.find((e) => String(e.courseId) === String(c.id))
        return { ...c, _progress: row?.progress || 0 }
      })
    return (
      <EnrolledCourses
        enrolledCourses={enrolledCourses}
        navigate={navigate}
        loading={!enrollmentsLoaded}
      />
    )
  }

  const activeCourse = courseById(courseId)
  if (!activeCourse) {
    return <Card className="p-8">
      <div className="mx-auto max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary"><BookOpen size={26} /></span>
        <h3 className="mt-4 text-lg font-semibold text-primary-deep">Course not found</h3>
        <p className="mt-1 text-sm text-slate-body">This course could not be found or you are not enrolled in it.</p>
        <button onClick={() => navigate('/trainee/workspace')} className="mt-4 text-sm font-medium text-primary hover:underline">Back to My Courses →</button>
      </div>
    </Card>
  }

  // The enrolled view is fully backend-driven: while the enrollment is still
  // being resolved (or the workspace is still loading) show a lightweight state.
  if (!enrollmentsLoaded || (enrollmentId && loadingWorkspace && !workspace)) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-sm text-center">
          <RefreshCw size={22} className="mx-auto animate-spin text-primary" />
          <h3 className="mt-4 text-lg font-semibold text-primary-deep">Loading your workspace…</h3>
          <p className="mt-1 text-sm text-slate-body">Syncing your progress from the platform.</p>
        </div>
      </Card>
    )
  }

  if (!enrollmentRow || !workspace) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary"><BookOpen size={26} /></span>
          <h3 className="mt-4 text-lg font-semibold text-primary-deep">Course not found</h3>
          <p className="mt-1 text-sm text-slate-body">This course could not be found or you are not enrolled in it.</p>
          <button onClick={() => navigate('/trainee/workspace')} className="mt-4 text-sm font-medium text-primary hover:underline">Back to My Courses →</button>
        </div>
      </Card>
    )
  }

  const course = workspace.course || activeCourse
  const en = workspace.enrollment
  const materials = workspace.materials || { notes: [], slides: [], videos: [], practice: [] }
  const progressValue = workspace.progress?.value ?? en?.progress ?? 0
  const sectionPlan = workspace.progress?.sectionPlan || []

  const content = {
    notes: (materials.notes || []).map(toUiMaterial),
    slides: (materials.slides || []).map(toUiMaterial),
    videos: (materials.videos || []).map(toUiMaterial),
    practice: (materials.practice || []).map(toUiMaterial),
  }
  // The material sections read `course.<key>`; give them the backend materials.
  const contentCourse = { ...course, notes: content.notes, slides: content.slides, videos: content.videos, practice: content.practice }

  // Material tabs are shown only when the course actually has content in that
  // section. Overview, Assessment, Feedback and Certificate are always present.
  const tabs = BASE_TABS.filter((t) => !t.material || content[t.key === 'video' ? 'videos' : t.key]?.length > 0)
  const hasAnyMaterial =
    content.notes.length || content.slides.length || content.videos.length || content.practice.length

  // Locking (Requirement: only Assessment and Certificate carry progression gates.
  // Study-material sections are always accessible when present. Feedback unlocks
  // only after the final assessment has been passed.)
  const hasEngaged = progressValue > 0
  const assessmentLocked = hasAnyMaterial ? !hasEngaged : false
  const feedbackLocked = !en?.assessment?.passed
  const certificateLocked = !(en?.assessment?.passed && hasSubmittedFeedback(workspace.feedback))

  const isTabLocked = (key) => {
    if (key === 'assessment') return assessmentLocked
    if (key === 'feedback') return feedbackLocked
    if (key === 'certificate') return certificateLocked
    return false
  }

  const goToTab = (key) => {
    if (!isTabLocked(key)) setActiveTab(key)
  }

  const handleProceedToAssessment = () => {
    if (isTabLocked('assessment')) {
      setAssessmentNotice(true)
    } else {
      setAssessmentNotice(false)
      setActiveTab('assessment')
    }
  }

  // Section completion routes through the backend's authoritative ordered gate
  // (POST /enrollments/:id/progress). Each section step of the current tab is
  // marked in order; any `ordered` block is surfaced as a message and the
  // workspace is refreshed so the UI always reflects server state.
  const completeStep = async (key) => {
    if (!enrollmentId) return
    const steps = sectionPlan.filter((s) => SECTION_TAB_KEY[s.sectionType] === key)
    if (!steps.length) return
    setNotice(null)
    for (const step of steps) {
      try {
        await enrollmentApi.markSectionComplete(enrollmentId, step.sectionId)
        await refreshWorkspace()
      } catch (err) {
        await refreshWorkspace()
        setNotice(err?.message || 'Your progress could not be updated right now.')
        break
      }
    }
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPanel course={course} en={en} />
      case 'notes':
        return (
          <NotesSection
            course={contentCourse}
            done={en?.notesDone}
            onComplete={() => completeStep('notes')}
          />
        )
      case 'slides':
        return (
          <PPTSection
            course={contentCourse}
            done={en?.slidesDone}
            onComplete={() => completeStep('slides')}
          />
        )
      case 'video':
        return (
          <VideoSection
            course={contentCourse}
            done={en?.videoDone}
            onComplete={() => completeStep('video')}
          />
        )
      case 'practice':
        return (
          <PracticeSection
            course={contentCourse}
            done={en?.practiceDone}
            onComplete={() => completeStep('practice')}
            onProceedToAssessment={handleProceedToAssessment}
          />
        )
      case 'assessment':
        return (
          <QuizEngine
            enrollmentId={enrollmentId}
            existing={en?.assessment}
            onPass={() => {
              refreshWorkspace()
              setActiveTab('feedback')
            }}
            onFail={() => {
              refreshWorkspace()
            }}
          />
        )
      case 'feedback':
        return (
          <FeedbackPanel
            submitted={hasSubmittedFeedback(workspace.feedback)}
            canUnlock={Boolean(en?.assessment?.passed)}
            onOpenModal={() => setShowFeedback(true)}
          />
        )
      case 'certificate':
        return <CertificateView course={course} enrollment={en} user={currentUser} />
      default:
        return <OverviewPanel course={course} en={en} />
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate('/trainee/workspace')} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-muted hover:text-primary">
          <ChevronLeft size={16} /> Back to My Courses
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge>{course.domain}</Badge>
              <Badge tone={course.difficulty === 'Advanced' ? 'navy' : course.difficulty === 'Intermediate' ? 'amber' : 'green'}>{course.difficulty}</Badge>
              {course.trainer && <span className="text-xs text-slate-muted">By {course.trainer}</span>}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-primary-deep">{course.title}</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-muted">
            <RefreshCw size={15} /> Progress: <Badge tone="blue">{Math.round(progressValue)}%</Badge>
          </div>
        </div>
      </div>

      <TabBar tabs={tabs} active={activeTab} locked={tabs.map((t) => isTabLocked(t.key))} onSelect={goToTab} />

      {assessmentNotice && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock size={16} className="shrink-0 text-amber-600" />
          <p className="flex-1">
            <span className="font-semibold">Assessment locked.</span> Please complete at least one study-material section first, then return to take the assessment.
          </p>
          <button onClick={() => setAssessmentNotice(false)} className="text-xs font-medium text-amber-600 hover:underline">Dismiss</button>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <p className="flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} className="text-xs font-medium text-rose-600 hover:underline">Dismiss</button>
        </div>
      )}

      {renderTab()}

      <FeedbackModal
        open={showFeedback}
        onClose={() => setShowFeedback(false)}
        course={course}
        onSubmitted={async (feedback) => {
          setShowFeedback(false)
          try {
            await enrollmentApi.submitFeedback(enrollmentId, feedback)
            await refreshWorkspace()
            setActiveTab('certificate')
          } catch (err) {
            setNotice(err?.message || 'Your feedback could not be submitted.')
          }
        }}
      />
    </div>
  )
}

function TabBar({ tabs, active, locked, onSelect }) {
  return (
    <div className="overflow-x-auto scroll-thin rounded-2xl border border-border-soft bg-white p-2">
      <div className="flex min-w-max items-center gap-1">
        {tabs.map((t) => {
          const isActive = t.key === active
          const isLocked = locked[tabs.findIndex((x) => x.key === t.key)]
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              disabled={isLocked && !isActive}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-[0_2px_8px_rgba(31,95,147,0.3)]'
                  : isLocked
                  ? 'cursor-not-allowed text-slate-muted'
                  : 'text-slate-body hover:bg-sky-light'
              }`}
            >
              {isLocked ? <Lock size={13} /> : <Icon size={14} />}
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OverviewPanel({ course, en }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-semibold text-primary-deep">About this course</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-body">{course.description || 'No description provided.'}</p>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-primary-deep">Learning Objectives</h4>
          <ul className="mt-2 space-y-1.5">
            {(course.objectives || []).length ? (
              course.objectives.map((o) => (
                <li key={o} className="flex items-start gap-2 text-sm text-slate-body">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" /> {o}
                </li>
              ))
            ) : (
              <li className="text-sm text-slate-muted">No learning objectives provided yet.</li>
            )}
          </ul>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-primary-deep">Syllabus</h4>
          <ol className="mt-2 space-y-1.5">
            {(course.syllabus || []).length ? (
              course.syllabus.map((s, i) => (
                <li key={s} className="flex items-start gap-2 text-sm text-slate-body">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-light text-[11px] font-semibold text-primary">{i + 1}</span>
                  {s}
                </li>
              ))
            ) : (
              <li className="text-sm text-slate-muted">No syllabus provided yet.</li>
            )}
          </ol>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h4 className="text-sm font-semibold text-primary-deep">Course Information</h4>
          <dl className="mt-3 space-y-2 text-sm">
            <OverviewRow label="Domain" value={course.domain} />
            <OverviewRow label="Difficulty" value={course.difficulty} />
            <OverviewRow label="Duration" value={course.duration} />
            <OverviewRow label="Trainer" value={course.trainer} />
            <OverviewRow label="Enrolled" value={`${course.enrolled ?? 0} trainees`} />
          </dl>
        </Card>
        <Card className="p-5">
          <h4 className="text-sm font-semibold text-primary-deep">Your Progress</h4>
          <div className="mt-3 flex items-end justify-between">
            <span className="text-2xl font-semibold text-primary">{Math.round(en?.progress || 0)}%</span>
            <span className="text-xs text-slate-muted">Overall</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#EAF0F6]">
            <div className="h-2 rounded-full bg-secondary transition-all" style={{ width: `${Math.round(en?.progress || 0)}%` }} />
          </div>
          <p className="mt-3 text-xs text-slate-muted">
            Explore the tabs above. Study materials are always open; the Assessment and Certificate unlock as you progress.
          </p>
        </Card>
      </div>
    </div>
  )
}

function OverviewRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-muted">{label}</dt>
      <dd className="text-right font-medium text-primary-deep">{value || '—'}</dd>
    </div>
  )
}

function FeedbackPanel({ submitted, canUnlock, onOpenModal }) {
  return (
    <Card className="p-8">
      <div className="mx-auto max-w-lg text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary">
          <MessageSquare size={24} />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-primary-deep">
          {submitted ? 'Feedback Submitted' : 'Course Feedback'}
        </h3>
        <p className="mt-2 text-sm text-slate-body">
          {submitted
            ? 'Thank you! Your feedback on this course has been recorded.'
            : canUnlock
            ? 'You passed the final assessment. Submit your feedback to unlock your verified certificate.'
            : 'Feedback unlocks after you pass the final assessment. Complete the assessment first, then return here to share your feedback and earn your verified certificate.'}
        </p>
        {submitted ? (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-muted">
            <AlertCircle size={13} /> You can view your certificate once you have passed the assessment.
          </p>
        ) : canUnlock ? (
          <button
            onClick={onOpenModal}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <MessageSquare size={16} /> Submit Feedback & Unlock Certificate
          </button>
        ) : (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-muted">
            <Lock size={13} /> Feedback is locked until you pass the assessment.
          </p>
        )}
      </div>
    </Card>
  )
}

function EnrolledCourses({ enrolledCourses, navigate, loading = false }) {
  if (loading) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-sm text-center">
          <RefreshCw size={22} className="mx-auto animate-spin text-primary" />
          <h3 className="mt-4 text-lg font-semibold text-primary-deep">Loading your courses…</h3>
          <p className="mt-1 text-sm text-slate-body">Syncing your enrollments from the platform.</p>
        </div>
      </Card>
    )
  }

  if (!enrolledCourses.length) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary"><BookOpen size={26} /></span>
          <h3 className="mt-4 text-lg font-semibold text-primary-deep">No courses joined yet</h3>
          <p className="mt-1 text-sm text-slate-body">
            You haven't joined any courses yet. Browse the course catalog to find training relevant to your domain.
          </p>
          <button onClick={() => navigate('/trainee/catalog')} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Browse Course Catalog <ArrowRight size={15} />
          </button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">Course Workspace</h2>
        <p className="text-sm text-slate-muted">Select a course to open its learning workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {enrolledCourses.map((course) => (
          <EnrolledCourseCard key={course.id} course={course} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}

function EnrolledCourseCard({ course, navigate }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/trainee/workspace/${course.id}`)}
      className="block w-full text-left"
    >
      <Card className="p-5 transition-colors hover:border-secondary/60 hover:shadow-md">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-light text-primary"><Layers size={22} /></span>
          <div className="min-w-0 flex-1">
            <Badge>{course.domain}</Badge>
            <h3 className="mt-1 truncate font-semibold text-primary-deep">{course.title}</h3>
            <div className="mt-0.5 text-xs text-slate-muted">
              <span>Trainer: {course.trainer || '—'}</span>
              <span className="mx-1.5">·</span>
              <span>Difficulty: {course.difficulty}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-muted">Progress</span>
            <span className="font-semibold text-primary">{(course._progress ?? 0)}%</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-[#EAF0F6]">
            <div className="h-2 rounded-full bg-secondary transition-all" style={{ width: `${course._progress ?? 0}%` }} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-light px-3 py-2 text-xs font-medium text-primary hover:bg-blue-100">
            Open Course <ArrowRight size={14} />
          </span>
        </div>
      </Card>
    </button>
  )
}
