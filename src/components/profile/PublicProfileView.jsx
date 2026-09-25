import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  Layers,
  MapPin,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, Card } from '../common/ui'
import * as userApi from '../../services/userApi'

// Public profile view. Shows only professional/public details gathered from the
// user's directory entry and full profile — never sensitive account data such as
// passwords, credentials or internal approval workflow fields.
export default function PublicProfileView({ backTo, uid: uidProp, onBack, backLabel, enrollment }) {
  const { uid: uidParam } = useParams()
  const uid = uidProp ?? uidParam
  const navigate = useNavigate()
  const { getProfileByUid, currentUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [apiCerts, setApiCerts] = useState([])

  const backendActive = currentUser?.authSource === 'supabase'

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getProfileByUid(uid)
      .then((p) => {
        // TEMPORARY task-6 diagnostics — remove after verification.
        if (p) {
          console.debug('[profile-debug] getProfileByUid resolved', {
            uid,
            requesterId: currentUser?.uid,
            authSource: currentUser?.authSource,
            backendActive,
            keys: Object.keys(p),
            expertise: p.expertise,
            domainExpertise: p.domainExpertise,
            specializations: p.specializations,
            skills: p.skills,
            qualifications: p.qualifications,
            achievements: p.achievements,
            trainingInterests: p.trainingInterests,
            organization: p.organization,
            title: p.title,
            yearsOfExperience: p.yearsOfExperience,
          })
        }
        if (mounted) setProfile(p)
      })
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, getProfileByUid])

  // Approved viewers read another user's certifications from the backend RBAC
  // projection; mock sessions fall back to the profile's own list.
  useEffect(() => {
    if (!backendActive || !profile?.uid) return
    let active = true
    userApi
      .getUserCertifications(profile.uid)
      .then((list) => {
        // TEMPORARY task-6 diagnostics — remove after verification.
        console.debug('[profile-debug] getUserCertifications resolved', { uid: profile.uid, count: list.length, certifications: list })
        if (active) setApiCerts(list)
      })
      .catch(() => {
        if (active) setApiCerts([])
      })
    return () => {
      active = false
    }
  }, [backendActive, profile?.uid])

  // TEMPORARY task-6 diagnostics — remove after verification.
  useEffect(() => {
    if (!enrollment) return
    const a = enrollment.assessment
    const c = enrollment.certificate
    console.debug('[profile-debug] enrollment prop received', {
      uid,
      courseTitle: enrollment.courseTitle,
      status: enrollment.status,
      stage: enrollment.stage,
      progress: enrollment.progress,
      assessment: a ? { percentage: a.percentage, score: a.score, attemptedAt: a.attemptedAt } : null,
      certificate: c ? { id: c.id, certificateNumber: c.certificateNumber, issuedOn: c.issuedOn } : null,
    })
  }, [enrollment, uid])

  const certifications = backendActive
    ? apiCerts
    : Array.isArray(profile?.certifications)
      ? profile.certifications
      : []

  // List fields may exist under several real field names depending on the data
  // source; resolve the first non-empty one (never inventing content).
  const expertise = pickList(profile, 'expertise', 'domainExpertise')
  const specializations = pickList(profile, 'specializations', 'specialisation', 'specialties')
  const skills = pickList(profile, 'skills', 'skillSets')
  const qualifications = pickList(profile, 'qualifications', 'education')
  const achievements = pickList(profile, 'achievements', 'accomplishments', 'awards')

  // Course-participation context (only provided when showing the profile inline
  // inside a trainer's course Trainees section). Uses the real enrollment row.
  const assessment = enrollment?.assessment || null
  const cert = enrollment?.certificate || null
  const scoreNum = assessment?.percentage ?? assessment?.score
  const scoreLabel = scoreNum == null
    ? null
    : assessment?.percentage != null
      ? `${scoreNum}%`
      : String(scoreNum)
  const courseName = enrollment?.courseTitle || null
  const enrollmentLabel = enrollment?.status
    ? ENROLL_STATUS_LABELS[String(enrollment.status).toLowerCase()] || titleCase(enrollment.status)
    : null
  const stageLabel = enrollment?.stage
    ? STAGE_LABELS[enrollment.stage] || titleCase(enrollment.stage)
    : null
  const progress = typeof enrollment?.progress === 'number' ? enrollment.progress : null
  const certNumber = cert?.certificateNumber || cert?.id || null
  const showDates = [enrollment?.startedOn, enrollment?.completedAt, assessment?.attemptedAt].some(Boolean)
  const participationVisible = Boolean(
    courseName || enrollmentLabel || progress != null || stageLabel || scoreLabel || cert,
  )

  const roleLabel = { TRAINEE: 'Trainee', TRAINER: 'Trainer', ADMIN: 'Admin' }
  const isSelf = currentUser && (currentUser.uid === profile?.uid)

  const goBack = () => {
    if (onBack) onBack()
    else if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <div className="space-y-6">
      <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-slate-muted hover:text-primary">
        <ChevronLeft size={16} /> {backLabel || 'Back'}
      </button>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-muted">Loading profile…</Card>
      ) : !profile ? (
        <Card className="p-8 text-center text-sm text-slate-muted">Profile not found.</Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-5">
              <Avatar name={profile.name} photoURL={profile.photoURL} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-primary-deep">{profile.name}</h2>
                  <Badge tone="navy"><BadgeCheck size={13} /> {roleLabel[profile.role] || profile.role}</Badge>
                  {isSelf && <Badge tone="green">This is you</Badge>}
                </div>
                {profile.title && <p className="mt-0.5 text-sm font-medium text-primary">{profile.title}</p>}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-muted">
                  {profile.organization && (
                    <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> {profile.organization}</span>
                  )}
                  {(profile.station || profile.region) && (
                    <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {[profile.station, profile.region].filter(Boolean).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>

            {profile.professionalSummary && (
              <p className="mt-5 rounded-xl border border-border-subtle bg-sky-soft p-4 text-sm leading-relaxed text-slate-body">
                {profile.professionalSummary}
              </p>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section icon={Sparkles} title="Domain Expertise">
              <Chips values={expertise} empty="No domain expertise listed" />
            </Section>
            <Section icon={Target} title="Specializations">
              <Chips values={specializations} empty="No specializations listed" />
            </Section>
            <Section icon={GraduationCap} title="Qualifications">
              <Chips values={qualifications} empty="No qualifications listed" />
            </Section>
            <Section icon={Award} title="Achievements">
              <Chips values={achievements} empty="No achievements listed" />
            </Section>
          </div>

          {skills.length > 0 && (
            <Section icon={UserRound} title="Skills">
              <Chips values={skills} empty="No skills listed" />
            </Section>
          )}

          {certifications.length > 0 && (
            <Section icon={Award} title="Professional Certifications">
              <div className="space-y-2">
                {certifications.map((cert) => (
                  <div key={cert.id} className="rounded-lg border border-border-subtle bg-sky-soft px-3 py-2">
                    <p className="text-sm font-medium text-primary-deep">
                      {cert.title || cert.certificationName}
                    </p>
                    <p className="text-xs text-slate-muted">
                      {[cert.issuingOrganization || cert.issuer, formatCertDate(cert.issueDate || cert.obtainedDate)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {participationVisible && (
            <Section icon={BookOpen} title="Course Participation">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {courseName && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-muted">Course</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-primary-deep">{courseName}</dd>
                  </div>
                )}
                {enrollmentLabel && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-muted">Enrollment</dt>
                    <dd className="mt-0.5 text-sm font-medium text-primary-deep">{enrollmentLabel}</dd>
                  </div>
                )}
                {progress != null && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-muted">Progress</dt>
                    <dd className="mt-0.5 flex items-center gap-2 text-sm font-medium text-primary-deep">
                      <span>{progress}%</span>
                      <span className="h-1.5 w-20 rounded-full bg-[#EAF0F6]">
                        <span className="block h-1.5 rounded-full bg-secondary" style={{ width: `${progress}%` }} />
                      </span>
                    </dd>
                  </div>
                )}
                {stageLabel && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-muted">Current stage</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-primary-deep">
                      <Layers size={14} className="text-primary" /> {stageLabel}
                    </dd>
                  </div>
                )}
                {scoreLabel && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-muted">Assessment score</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-primary-deep">
                      <ClipboardCheck size={14} className="text-primary" /> {scoreLabel}
                    </dd>
                  </div>
                )}
                {typeof assessment?.passed === 'boolean' && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-muted">Assessment status</dt>
                    <dd className="mt-0.5">
                      <Badge tone={assessment.passed ? 'green' : 'amber'}>{assessment.passed ? 'Passed' : 'Not passed'}</Badge>
                    </dd>
                  </div>
                )}
              </dl>

              {showDates && (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle pt-3 text-xs text-slate-muted">
                  {enrollment?.startedOn && (
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> Started {formatCertDate(enrollment.startedOn)}</span>
                  )}
                  {enrollment?.completedAt && (
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> Completed {formatCertDate(enrollment.completedAt)}</span>
                  )}
                  {assessment?.attemptedAt && (
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> Assessed {formatCertDate(assessment.attemptedAt)}</span>
                  )}
                </div>
              )}

              {cert && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <Award size={15} className="text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800">Certificate Issued</span>
                  {certNumber && <span className="text-xs text-emerald-700">No. {certNumber}</span>}
                  {cert.issuedOn && <span className="text-xs text-emerald-700">{formatCertDate(cert.issuedOn)}</span>}
                </div>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <Card className="p-5">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-primary-deep">
        <Icon size={16} className="text-primary" /> {title}
      </h4>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

function Chips({ values, empty }) {
  const list = Array.isArray(values) && values.length ? values : []
  if (!list.length) return <p className="text-sm text-slate-muted">{empty}</p>
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((v) => (
        <span key={v} className="rounded-lg bg-sky-light px-2.5 py-1 text-xs font-medium text-primary">
          {v}
        </span>
      ))}
    </div>
  )
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

// First non-empty array found under any of the given real field names. This only
// surfaces data that already exists — it never invents profile content.
function pickList(obj, ...keys) {
  for (const k of keys) {
    const v = listValue(obj?.[k])
    if (v.length) return v
  }
  return []
}

function titleCase(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const ENROLL_STATUS_LABELS = {
  completed: 'Completed',
  inprogress: 'In Progress',
  enrolled: 'Enrolled',
  active: 'Active',
  cancelled: 'Cancelled',
}

const STAGE_LABELS = {
  notes: 'Study Notes',
  slides: 'Slide Decks',
  video: 'Video Lectures',
  practice: 'Practice',
  assessment: 'Assessment',
  feedback: 'Feedback',
  certificate: 'Certificate',
}

function formatCertDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return String(d)
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })
}
