import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  Layers,
  Rocket,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { deadlines } from '../../data/mockData'
import { useBroadcasts } from '../../context/BroadcastContext'
import { Card, Badge, ProgressBar, Tabs, EmptyState } from '../common/ui'
import CourseCatalogView from './CourseCatalogView'

const quickAccess = [
  { label: 'My Learning', icon: BookOpen, to: '/trainee', view: 'In Progress' },
  { label: 'Available Courses', icon: Layers, to: '/trainee/catalog' },
  { label: 'Active Training', icon: Rocket, to: '/trainee/workspace' },
  { label: 'Resources', icon: FileText, to: '/trainee/workspace' },
  { label: 'Assessments', icon: ClipboardList, to: '/trainee/workspace' },
  { label: 'Reports', icon: BarChart3, to: '/trainee/progress' },
]

export default function HomeView() {
  const { currentUser } = useAuth()
  const { broadcasts } = useBroadcasts()
  const navigate = useNavigate()
  const [view, setView] = useState('In Progress')

  const isPending = currentUser?.status === 'pending'

  return (
    <div className="space-y-8">
      {/* Welcome hero */}
      <HeroSection />

      {/* Pending verification notice */}
      {isPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Clock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Your account is currently under verification.</p>
            <p className="mt-0.5">
              You can explore the course catalog below, but enrollment and operational training
              features unlock after approval by an authorized administrator.
            </p>
          </div>
        </div>
      )}

      {/* Quick access */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-muted">Quick Access</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickAccess.map((q) => (
            <button
              key={q.label}
              onClick={() => {
                if (q.view) setView(q.view)
                navigate(q.to)
              }}
              className="cursor-pointer rounded-2xl border border-border-soft bg-white p-4 text-center transition-shadow hover:shadow-[0_6px_20px_rgba(31,95,147,0.08)]"
            >
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-sky-light text-primary">
                <q.icon size={18} />
              </div>
              <p className="mt-2 text-xs font-medium text-primary-deep">{q.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Broadcasts */}
      {broadcasts.filter((b) => b.published && (b.audienceKey === 'all-trainees' || b.audienceKey === 'all')).map((b) => (
        <div key={b.id} className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-sky-light to-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white">
                <ShieldCheck size={20} />
              </span>
              <div>
                <h4 className="font-semibold text-primary-deep">{b.title}</h4>
                <p className="mt-0.5 text-sm text-slate-body">{b.body}</p>
                <p className="mt-1 text-xs text-slate-muted">{b.type} · {b.date}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* In Progress / Explore toggle */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary-deep">
            {view === 'In Progress' ? 'Your Learning' : 'Course Catalog'}
          </h2>
          <p className="text-sm text-slate-muted">
            {view === 'In Progress'
              ? 'Continue where you left off across your enrolled courses.'
              : 'Discover scientific courses across all domains.'}
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <Tabs
            tabs={['In Progress', 'Explore Catalog']}
            active={view}
            onChange={setView}
          />
        </div>
      </div>

      {/* Content */}
      {view === 'In Progress' ? (
        <InProgressSection onContinue={navigate} />
      ) : (
        <CourseCatalogView />
      )}

      {/* Upcoming deadlines + calendar */}
      <DeckSection />
    </div>
  )
}

function HeroSection() {
  const navigate = useNavigate()
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-secondary p-8 text-white sm:p-10">
      <div className="pointer-events-none absolute inset-0">
        <svg viewBox="0 0 800 300" className="absolute inset-0 h-full w-full opacity-15" preserveAspectRatio="none">
          <path d="M0,150 Q100,90 200,140 T400,140 T600,150 T800,130" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M0,190 Q120,140 240,180 T480,180 T720,190 T800,170" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      </div>
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <Target size={14} /> India Meteorological Department
        </span>
        <h1 className="mt-4 text-3xl font-semibold leading-snug sm:text-4xl">
          Empower. Learn. Grow Together.
        </h1>
        <p className="mt-2 max-w-lg text-sm text-blue-100">
          Strengthening scientific capacity and operational readiness across India's
          meteorological workforce.
        </p>
        <button
          onClick={() => navigate('/trainee/catalog')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-primary hover:bg-sky-light"
        >
          Explore Courses <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

function InProgressSection({ onContinue }) {
  const { courseCatalog, getEnrollment } = useCourses()
  const enrollments = courseCatalog.filter((c) => getEnrollment(c.id))
  if (!enrollments.length) {
    return (
      <Card>
        <EmptyState
          icon={BookOpen}
          title="No courses in progress"
          description="Explore the catalog to enroll in your next scientific course."
        />
      </Card>
    )
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {enrollments.map((c) => {
        const en = getEnrollment(c.id)
        const progress = en?.progress || 0
        return (
          <Card key={c.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-light text-primary">
                <BookOpen size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <Badge>{c.domain}</Badge>
                  <Badge tone="blue">{Math.round(progress)}%</Badge>
                </div>
                <h4 className="mt-2 font-semibold text-primary-deep">{c.title}</h4>
                <p className="text-xs text-slate-muted">Stage: {c.stageLabel || stageLabel(en)}</p>
                <div className="mt-3">
                  <ProgressBar value={progress} />
                </div>
                <button
                  onClick={() => onContinue(`/trainee/workspace/${c.id}`)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-sky-light px-3 py-1.5 text-sm font-medium text-primary hover:bg-blue-100"
                >
                  Continue Learning <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function stageLabel(en) {
  if (!en) return 'Not started'
  const map = { notes: 'Study Notes', slides: 'Slide Decks', video: 'Video Lectures', practice: 'Practice Sets', assessment: 'Assessment', feedback: 'Feedback', certificate: 'Completed' }
  return map[en.stage] || 'Learning'
}

function DeckSection() {
  const { currentUser } = useAuth()
  const { myCertificates, courseById } = useCourses()
  // The deadlines list is static demo content from the mock store — there is no
  // real scheduling backend — so it only renders in the dev-mock experience.
  const isBackend = Boolean(currentUser && currentUser.authSource === 'supabase')
  const recent = [...myCertificates]
    .sort((a, b) => String(b.certificate?.issuedOn || '').localeCompare(String(a.certificate?.issuedOn || '')))[0]

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <Calendar size={18} className="text-primary" /> Upcoming Deadlines
          </h3>
        </div>
        {!isBackend && deadlines.length ? (
          <div className="mt-4 space-y-3">
            {deadlines.map((d) => (
              <div key={d.label} className="flex items-center gap-4 rounded-xl border border-border-subtle bg-sky-soft p-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
                  <div className="text-center">
                    <p className="text-base font-bold leading-none">{d.day}</p>
                    <p className="text-[10px] font-medium">{d.month}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary-deep">{d.label}</p>
                  <p className="text-xs text-slate-muted">{d.when}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={Calendar}
              title="No scheduled deadlines"
              description="Scheduled training deadlines will appear here for your station."
            />
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
          <Award size={18} className="text-primary" /> Recent Achievements
        </h3>
        {recent ? (
          <div className="mt-4 rounded-xl border border-border-subtle bg-sky-soft p-4">
            <p className="text-sm font-medium text-primary-deep">Verified Certificate Earned</p>
            <p className="text-xs text-slate-muted">
              {courseById(recent.courseId)?.title || 'Course'} · {recent.certificate.certificateNumber}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="green"><Award size={12} /> Competency Verified</Badge>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-muted">
            No certificates earned yet. Complete a course to unlock your verified certificate here.
          </p>
        )}
      </Card>
    </div>
  )
}
