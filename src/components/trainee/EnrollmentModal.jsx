import { useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck,
  Lock,
  LogIn,
  MessageSquare,
  PlayCircle,
  Presentation,
  User,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { Badge, Button, Modal } from '../common/ui'

const workflow = [
  { label: 'Study Notes', icon: BookOpen },
  { label: 'Slide Decks', icon: Presentation },
  { label: 'Video Lectures', icon: PlayCircle },
  { label: 'Practice Sets', icon: ClipboardCheck },
  { label: 'Final Assessment', icon: FileCheck },
  { label: 'Mandatory Feedback', icon: MessageSquare },
  { label: 'Verified Certificate', icon: Award },
]

export default function EnrollmentModal({ course, open, onClose }) {
  const navigate = useNavigate()
  const { enroll, getEnrollment } = useCourses()
  const { currentUser } = useAuth()

  if (!course) return null

  const alreadyEnrolled = !!getEnrollment(course.id)

  const canEnroll = currentUser?.role === 'TRAINEE' && currentUser?.status === 'approved'
  const isPending = currentUser?.status === 'pending'
  const isPublic = !currentUser

  const handleConfirm = async () => {
    const fresh = await enroll(course.id)
    if (fresh) {
      onClose()
      navigate(`/trainee/workspace/${course.id}`, { state: { justEnrolled: true } })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Course Enrollment" size="max-w-3xl">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{course.domain}</Badge>
          <Badge tone={course.difficulty === 'Advanced' ? 'navy' : course.difficulty === 'Intermediate' ? 'amber' : 'green'}>
            {course.difficulty}
          </Badge>
          {course.status === 'featured' && <Badge tone="navy">Featured</Badge>}
        </div>
        <h3 className="mt-3 text-xl font-semibold text-primary-deep">{course.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-body">{course.description}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoPill icon={Clock} label="Duration" value={course.duration} />
          <InfoPill icon={User} label="Trainer" value={course.trainer} />
          <InfoPill icon={BarChart3} label="Enrolled" value={`${course.enrolled} trainees`} />
        </div>

        {/* Objectives & syllabus */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-primary-deep">Learning Objectives</h4>
            <ul className="mt-2 space-y-1.5">
              {course.objectives.map((o) => (
                <li key={o} className="flex items-start gap-2 text-sm text-slate-body">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" /> {o}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-primary-deep">Syllabus Overview</h4>
            <ol className="mt-2 space-y-1.5">
              {course.syllabus.map((s, i) => (
                <li key={s} className="flex items-start gap-2 text-sm text-slate-body">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-light text-[11px] font-semibold text-primary">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Workflow preview */}
        <div className="mt-6 rounded-2xl border border-border-soft bg-sky-soft p-5">
          <h4 className="text-sm font-semibold text-primary-deep">Your Learning Journey</h4>
          <div className="mt-3 flex flex-col gap-1">
            {workflow.map((w, i) => (
              <div key={w.label} className="flex items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-lg ${
                      i === 4
                        ? 'bg-primary text-white'
                        : 'bg-white text-primary border border-blue-100'
                    }`}
                  >
                    <w.icon size={15} />
                  </span>
                  <span className="text-sm font-medium text-primary-deep">{w.label}</span>
                </div>
                {i < workflow.length - 1 && (
                  <ArrowDown size={14} className="ml-12 text-slate-muted" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Dynamic Assessment Formula</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-body">
              <Badge tone="green">20% Easy</Badge>
              <Badge tone="amber">30% Medium</Badge>
              <Badge tone="navy">50% Hard</Badge>
              <span className="text-slate-muted">·</span>
              <Badge tone="slate">Correct +1</Badge>
              <Badge tone="slate">Wrong −0.25</Badge>
              <Badge tone="slate">Unattempted 0</Badge>
            </div>
            <p className="mt-2 text-xs font-medium text-primary-deep">Passing requirement: ≥75%</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="subtle" onClick={onClose}>Close</Button>
          {isPublic && (
            <Button onClick={() => navigate('/auth')}>
              <LogIn size={16} /> Sign In to Enroll
            </Button>
          )}
          {isPending && (
            <div className="flex flex-col gap-2">
              <Button variant="subtle" disabled>
                <Lock size={16} /> Account Verification Required
              </Button>
              <p className="text-xs text-slate-muted">
                Your account is awaiting administrative approval. Operational features will unlock after verification.
              </p>
            </div>
          )}
          {canEnroll && !alreadyEnrolled && (
            <Button onClick={handleConfirm}>
              Enroll Now <ArrowRight size={16} />
            </Button>
          )}
          {canEnroll && alreadyEnrolled && (
            <Button variant="outline" onClick={() => { onClose(); navigate(`/trainee/workspace/${course.id}`); }}>
              Open Course <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function InfoPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-sky-soft p-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-primary">
        <Icon size={16} />
      </span>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-muted">{label}</p>
        <p className="text-sm font-medium text-primary-deep">{value}</p>
      </div>
    </div>
  )
}
