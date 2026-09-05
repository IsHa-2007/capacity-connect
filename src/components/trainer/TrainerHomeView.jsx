import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Layers,
  Lock,
  Plus,
  Star,
  Upload,
  Users,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTrainer } from '../../context/TrainerContext'
import { useCourses } from '../../context/CourseContext'
import { useBroadcasts } from '../../context/BroadcastContext'
import { Card, Button, StatCard, Badge } from '../common/ui'

export default function TrainerHomeView() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { analytics } = useTrainer()
  const { myCourses } = useCourses()
  const { broadcasts } = useBroadcasts()

  const isPending = currentUser?.status === 'pending'

  const trainerBroadcasts = broadcasts.filter(
    (b) => b.published && (b.audienceKey === 'all-trainers' || b.audienceKey === 'all'),
  )

  const published = myCourses.filter((c) => c.status === 'published').length
  const avgAll =
    analytics.feedbackCount > 0
      ? (
          (analytics.feedbackRatings.contentDepth +
            analytics.feedbackRatings.trainerDelivery +
            analytics.feedbackRatings.operationalRelevance) /
          (3 * analytics.feedbackCount)
        ).toFixed(1)
      : '—'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-secondary p-8 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        </div>
        <div className="relative">
          <h1 className="text-2xl font-semibold">
            Welcome back, {firstName(currentUser?.name)} 👋
          </h1>
          <p className="mt-1.5 max-w-lg text-sm text-blue-100">
            Manage your scientific courses, question banks, and trainee performance from a single command center.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button className="bg-white text-primary hover:bg-sky-light" disabled={isPending} onClick={() => navigate('/trainer/courses?new=1')}>
              <Plus size={16} /> Create New Course
            </Button>
            <Button className="bg-white/20 text-white hover:bg-white/30" onClick={() => navigate('/trainer/courses')}>
              Manage Courses <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Pending verification notice */}
      {isPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Lock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Your account is awaiting administrative approval.</p>
            <p className="mt-0.5">
              Operational features will unlock after verification. You can maintain your
              professional profile while your account is under review.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Layers} label="Total Courses" value={analytics.courses} sub={`${published} published`} />
        <StatCard icon={Users} label="Active Trainees" value={analytics.activeTrainees} sub="Across all courses" tone="green" />
        <StatCard icon={TrendingUp} label="Avg Assessment" value={analytics.avgAssessment ? `${analytics.avgAssessment}%` : '—'} sub="All assessments" tone="amber" />
        <StatCard icon={Star} label="Avg Feedback" value={avgAll !== '—' ? `${avgAll} / 5` : '—'} sub={`${analytics.feedbackCount} submissions`} tone="navy" />
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-muted">Quick Actions</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isPending ? (
            <ActionCard
              icon={Lock}
              title="Create New Course"
              text="Operational trainer functions unlock after approval."
              locked
            />
          ) : (
            <ActionCard icon={Plus} title="Create New Course" text="Design a new scientific curriculum" onClick={() => navigate('/trainer/courses?new=1')} />
          )}
          <ActionCard icon={Upload} title="Upload Material" text={isPending ? 'Locked awaiting approval.' : 'Add notes, decks, and videos'} onClick={isPending ? undefined : () => navigate('/trainer/courses')} locked={isPending} />
          <ActionCard icon={ClipboardList} title="Manage Question Bank" text={isPending ? 'Locked awaiting approval.' : 'Author easy/medium/hard questions'} onClick={isPending ? undefined : () => navigate('/trainer/courses?tab=Question Bank')} locked={isPending} />
          <ActionCard icon={Users} title="View Trainee Analytics" text={isPending ? 'Locked awaiting approval.' : 'Monitor performance and gaps'} onClick={isPending ? undefined : () => navigate('/trainer/courses?tab=Analytics')} locked={isPending} />
        </div>
      </div>

      {/* Recent courses */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <BookOpen size={18} className="text-primary" /> Your Courses
          </h3>
          <button onClick={() => navigate('/trainer/courses')} className="text-sm font-medium text-primary hover:underline">View all →</button>
        </div>
        {myCourses.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {myCourses.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-sky-soft p-4">
                <div>
                  <Badge>{c.domain}</Badge>
                  <p className="mt-1.5 font-medium text-primary-deep">{c.title}</p>
                  <p className="text-xs text-slate-muted">{c.status === 'published' ? 'Published' : 'Draft'}</p>
                </div>
                <div className="text-right">
                  <Badge tone={c.status === 'published' ? 'green' : 'slate'}>{c.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-muted">No courses yet. Create your first scientific course to get started.</p>
        )}
      </Card>

      {/* Admin broadcasts */}
      {trainerBroadcasts.length > 0 && (
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <TrendingUp size={18} className="text-primary" /> Recent Admin Broadcasts
          </h3>
          <div className="mt-3 space-y-2">
            {trainerBroadcasts.slice(0, 3).map((b) => (
              <div key={b.id} className="rounded-xl border border-border-subtle bg-sky-soft p-3">
                <p className="text-sm font-medium text-primary-deep">{b.title}</p>
                <p className="text-xs text-slate-muted">{b.body}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function ActionCard({ icon: Icon, title, text, onClick, locked }) {
  return (
    <Card onClick={locked ? undefined : onClick} className={`p-5 transition-shadow ${locked ? 'opacity-60' : 'cursor-pointer hover:shadow-[0_6px_20px_rgba(31,95,147,0.08)]'}`}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-light text-primary"><Icon size={18} /></span>
      <h4 className="mt-3 font-semibold text-primary-deep">{title}</h4>
      <p className="mt-1 text-sm text-slate-muted">{text}</p>
    </Card>
  )
}

function firstName(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  const titleRe = /^(Dr|Mr|Mrs|Ms|Prof|Smt|Shri|Sri|Er)\.?$/i
  const first = parts.find((p) => !titleRe.test(p))
  return first || parts[0]
}
