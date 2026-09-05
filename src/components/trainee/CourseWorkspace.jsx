import { useState } from 'react'
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

const progressByTab = { overview: 5, notes: 15, slides: 30, video: 45, practice: 60, assessment: 75, feedback: 88, certificate: 100 }

function contentOf(course) {
  return {
    notes: Array.isArray(course?.notes) ? course.notes : [],
    slides: Array.isArray(course?.slides) ? course.slides : [],
    videos: Array.isArray(course?.videos) ? course.videos : [],
    practice: Array.isArray(course?.practice) ? course.practice : [],
  }
}

export default function CourseWorkspace() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { courseCatalog, courseById, getEnrollment, updateEnrollment, recordCompetency } = useCourses()
  const [activeTab, setActiveTab] = useState('overview')
  const [showFeedback, setShowFeedback] = useState(false)
  const [assessmentNotice, setAssessmentNotice] = useState(false)

  const enrolledCourses = courseCatalog.filter((c) => getEnrollment(c.id))

  // No courseId selected → show the enrolled-courses card list.
  if (!courseId) {
    const withProgress = enrolledCourses.map((c) => ({ ...c, _progress: getEnrollment(c.id)?.progress || 0 }))
    return <EnrolledCourses enrolledCourses={withProgress} navigate={navigate} />
  }

  const activeCourse = courseById(courseId)
  if (!activeCourse) {
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

  const enrollment = getEnrollment(activeCourse.id)
  const en = enrollment
  const course = activeCourse
  const content = contentOf(course)

  // Material tabs are shown only when the course actually has content in that
  // section. Overview, Assessment, Feedback and Certificate are always present.
  const tabs = BASE_TABS.filter((t) => !t.material || content[t.key === 'video' ? 'videos' : t.key]?.length > 0)
  const hasAnyMaterial =
    content.notes.length || content.slides.length || content.videos.length || content.practice.length

  // Locking (Requirement: only Assessment and Certificate carry progression gates.
  // Study-material sections are always accessible when present. Feedback unlocks
  // only after the final assessment has been passed.)
  const hasEngaged = Boolean(en && en.progress && en.progress > 0)
  const assessmentLocked = hasAnyMaterial ? !hasEngaged : false
  const feedbackLocked = !Boolean(en?.assessment?.passed)
  const certificateLocked = !(en?.assessment?.passed && en?.feedback)

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

  const completeStep = (flag, nextProgress) => {
    if (!en) return
    updateEnrollment(course.id, {
      [flag]: true,
      progress: Math.max(en.progress || 0, nextProgress),
    })
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPanel course={course} en={en} />
      case 'notes':
        return (
          <NotesSection
            course={course}
            done={en?.notesDone}
            onComplete={() => completeStep('notesDone', progressByTab.slides)}
          />
        )
      case 'slides':
        return (
          <PPTSection
            course={course}
            done={en?.slidesDone}
            onComplete={() => completeStep('slidesDone', progressByTab.video)}
          />
        )
      case 'video':
        return (
          <VideoSection
            course={course}
            done={en?.videoDone}
            onComplete={() => completeStep('videoDone', progressByTab.practice)}
          />
        )
      case 'practice':
        return (
          <PracticeSection
            course={course}
            done={en?.practiceDone}
            onComplete={() => completeStep('practiceDone', progressByTab.assessment)}
            onProceedToAssessment={handleProceedToAssessment}
          />
        )
      case 'assessment':
        return (
          <QuizEngine
            course={course}
            existing={en?.assessment}
            onPass={(res) => {
              updateEnrollment(course.id, {
                assessment: res,
                progress: 75,
                attempts: (en?.attempts || 0) + 1,
              })
            }}
            onFail={(res) => {
              updateEnrollment(course.id, {
                assessment: res,
                progress: 75,
                attempts: (en?.attempts || 0) + 1,
              })
            }}
          />
        )
      case 'feedback':
        return (
          <FeedbackPanel
            submitted={en?.feedback}
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
            <RefreshCw size={15} /> Progress: <Badge tone="blue">{Math.round(en?.progress || 0)}%</Badge>
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

      {renderTab()}

      <FeedbackModal
        open={showFeedback}
        onClose={() => setShowFeedback(false)}
        course={course}
        onSubmitted={(feedback) => {
          updateEnrollment(course.id, {
            feedback,
            certificate:
              en?.assessment?.passed
                ? {
                    id: en?.certificate?.id || `CC-2026-${String(4821 + course.id.length).padStart(6, '0')}`,
                    issuedOn: new Date().toISOString().slice(0, 10),
                  }
                : en?.certificate || null,
            progress: en?.assessment?.passed ? 100 : progressByTab.feedback,
            stage: 'certificate',
            status: en?.assessment?.passed ? 'completed' : en?.status,
          })
          if (en?.assessment?.passed) {
            recordCompetency(course.id, en?.assessment?.percentage || 0)
            setActiveTab('certificate')
          }
          setShowFeedback(false)
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

function EnrolledCourses({ enrolledCourses, navigate }) {
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
