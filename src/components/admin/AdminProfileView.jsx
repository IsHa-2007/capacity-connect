import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  ChevronLeft,
  Clock,
  GraduationCap,
  IdCard,
  Mail,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  UserCog,
  UserCircle,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { Avatar, Badge, Button, Card } from '../common/ui'

// Admin-facing full profile. Intended for the Admin Console only. Shows the
// ACTUAL selected user's identity + professional + role-relevant data.
// Sensitive credentials (passwords) are never part of profile objects and are
// never rendered here.
export default function AdminProfileView() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const { currentUser, getProfileByUid, allUsers, changeUserRole } = useAuth()
  const { courseCatalog, enrollments } = useCourses()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [changeOpen, setChangeOpen] = useState(false)
  const [draftRole, setDraftRole] = useState('')
  const [roleMsg, setRoleMsg] = useState('')

  const isAdmin = currentUser?.role === 'ADMIN'

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getProfileByUid(uid)
      .then((p) => mounted && setProfile(p))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [uid, getProfileByUid])

  useEffect(() => {
    if (!profile) return
    const row = allUsers.find((u) => (u.uid || u.id) === (profile.uid || profile.id))
    if (row && row !== profile) setProfile((p) => ({ ...p, ...row }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, uid])

  const roleLabel = { TRAINEE: 'Trainee', TRAINER: 'Trainer', ADMIN: 'Admin' }
  const statusTone = profile?.status === 'approved' ? 'green' : profile?.status === 'pending' ? 'amber' : 'rose'

  const soleApprovedAdmin =
    profile?.role === 'ADMIN' &&
    profile?.status === 'approved' &&
    allUsers.filter((x) => x.role === 'ADMIN' && x.status === 'approved').length === 1

  const openChangeRole = () => {
    if (!profile) return
    setDraftRole(profile.role)
    setRoleMsg('')
    setChangeOpen(true)
  }

  const confirmChangeRole = async () => {
    if (!profile || draftRole === (profile.role || '')) return
    await changeUserRole(profile.uid || profile.id, draftRole)
    setProfile((p) => ({ ...p, role: draftRole }))
    setChangeOpen(false)
  }

  const courses = profile
    ? profile.role === 'TRAINER'
      ? courseCatalog.filter((c) => c.trainerId === (profile.trainerProfileId || profile.uid || profile.id))
      : courseCatalog.filter((c) => enrollments.some((e) => e.courseId === c.id && e.traineeId === (profile.uid || profile.id)))
    : []

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-1 text-sm text-slate-muted hover:text-primary">
        <ChevronLeft size={16} /> Back to User Management
      </button>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-muted">Loading profile…</Card>
      ) : !profile ? (
        <Card className="p-8 text-center text-sm text-slate-muted">Profile not found.</Card>
      ) : (
        <>
          {/* Identity header */}
          <Card className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-light to-white" />
            <div className="relative flex flex-wrap items-center gap-5">
              <Avatar name={profile.name} photoURL={profile.photoURL} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-primary-deep">{profile.name}</h2>
                  <Badge tone="navy"><BadgeCheck size={13} /> {roleLabel[profile.role] || profile.role}</Badge>
                  <Badge tone={statusTone}>{String(profile.status || profile.approvalStatus || '').toUpperCase()}</Badge>
                  {isAdmin && (
                    <Button
                      variant="soft"
                      onClick={openChangeRole}
                      disabled={soleApprovedAdmin}
                      title={soleApprovedAdmin ? 'Cannot demote the only approved administrator' : 'Change this user\'s role'}
                    >
                      <UserCog size={14} /> Change Role
                    </Button>
                  )}
                </div>
                {profile.title && <p className="mt-0.5 text-sm font-medium text-primary">{profile.title}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-muted">
                  <span className="inline-flex items-center gap-1.5"><Mail size={14} /> {profile.email || '—'}</span>
                  <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> {profile.organization || 'India Meteorological Department'}</span>
                  {(profile.station || profile.region) && (
                    <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {[profile.station, profile.region].filter(Boolean).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Basic / identity details */}
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <ShieldCheck size={17} className="text-primary" /> Account & Identity
            </h3>
            <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <InfoRow icon={UserCircle} label="User ID" value={profile.uid || profile.id} />
              <InfoRow icon={Mail} label="Email" value={profile.email || '—'} />
              <InfoRow icon={IdCard} label="Govt / Dept ID" value={profile.empId || '—'} />
              <InfoRow icon={Building2} label="Department" value={profile.department || '—'} />
              <InfoRow icon={UserRound} label="Role" value={roleLabel[profile.role] || profile.role} />
              <InfoRow icon={MapPin} label="Station / Region" value={[profile.station, profile.region].filter(Boolean).join(', ') || '—'} />
            </div>
          </Card>

          {/* Professional summary */}
          {profile.professionalSummary && (
            <Card className="p-5">
              <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
                <Briefcase size={17} className="text-primary" /> Professional Summary
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-body">{profile.professionalSummary}</p>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Section icon={Sparkles} title="Domain Expertise">
              <Chips values={profile.expertise} empty="No domain expertise listed" />
            </Section>
            <Section icon={Target} title="Specializations">
              <Chips values={profile.specializations} empty="No specializations listed" />
            </Section>
            <Section icon={GraduationCap} title="Qualifications">
              <Chips values={profile.qualifications} empty="No qualifications listed" />
            </Section>
            <Section icon={Award} title="Professional Achievements">
              <Chips values={profile.achievements} empty="No achievements listed" />
            </Section>
            <Section icon={UserRound} title="Skills">
              <Chips values={profile.skills} empty="No skills listed" />
            </Section>
            <Section icon={Target} title="Areas of Training Interest">
              <Chips values={profile.trainingInterests} empty="No training interests listed" />
            </Section>
          </div>

          {profile.yearsOfExperience && (
            <Card className="p-5">
              <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
                <Clock size={17} className="text-primary" /> Experience
              </h3>
              <p className="mt-2 text-sm text-slate-body">{profile.yearsOfExperience}</p>
            </Card>
          )}

          {/* Role-relevant: courses */}
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <BookOpen size={17} className="text-primary" />
              {profile.role === 'TRAINER' ? 'Courses (as Trainer)' : 'Enrolled Courses'}
            </h3>
            {courses.length ? (
              <div className="mt-3 space-y-2">
                {courses.map((c) => {
                  const en = enrollments.find((e) => e.courseId === c.id && e.traineeId === profile.uid)
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-sky-soft p-3 text-sm">
                      <div>
                        <p className="font-medium text-primary-deep">{c.title}</p>
                        <p className="text-xs text-slate-muted">{c.domain} · {c.difficulty}</p>
                      </div>
                      {en ? (
                        <Badge tone={en.status === 'completed' ? 'green' : 'blue'}>
                          {en.status === 'completed' ? 'Completed' : `In Progress · ${en.progress || 0}%`}
                        </Badge>
                      ) : (
                        <Badge tone={c.status === 'published' ? 'green' : 'slate'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-muted">
                {profile.role === 'TRAINER' ? 'No courses assigned to this trainer.' : 'This trainee has not enrolled in any courses yet.'}
              </p>
            )}
          </Card>
        </>
      )}

      {changeOpen && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-primary-deep/40 backdrop-blur-sm" onClick={() => setChangeOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border-soft bg-white p-6 shadow-2xl">
            <h3 className="font-semibold text-primary-deep">Change User Role</h3>
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm">
                Select the new role for <b>{profile.name}</b>. This updates their real
                permissions across the platform and takes effect immediately.
              </p>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-primary-deep">New Role</label>
              <select
                value={draftRole}
                onChange={(e) => setDraftRole(e.target.value)}
                className="w-full rounded-lg border border-border-soft bg-sky-soft px-3 py-2 text-sm text-slate-deep outline-none focus:border-secondary"
              >
                {['TRAINEE', 'TRAINER', 'ADMIN'].map((r) => (
                  <option key={r} value={r}>{roleLabel[r]}</option>
                ))}
              </select>
            </div>
            {roleMsg && <p className="mt-2 text-sm text-rose-600">{roleMsg}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="subtle" onClick={() => setChangeOpen(false)}>Cancel</Button>
              <Button onClick={confirmChangeRole} disabled={draftRole === (profile.role || '')}>Confirm Change</Button>
            </div>
          </div>
        </div>
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
        <span key={v} className="rounded-lg bg-sky-light px-2.5 py-1 text-xs font-medium text-primary">{v}</span>
      ))}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
      <span className="flex items-center gap-2 text-slate-muted"><Icon size={14} /> {label}</span>
      <span className="font-medium text-primary-deep">{value}</span>
    </div>
  )
}
