import { useEffect, useState } from 'react'
import {
  Award,
  BadgeCheck,
  BookOpen,
  Clock,
  Download,
  GraduationCap,
  MapPin,
  Pencil,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { Card, Badge, Button, ProgressBar } from '../common/ui'
import ProfileEditor from '../profile/ProfileEditor'
import CertificationManager from '../profile/CertificationManager'
import { exportCertificatePDF } from '../../utils/pdfExport'
import { listCertificates } from '../../services/certificateApi.js'

export default function ProfileView() {
  const { currentUser } = useAuth()
  const { courseCatalog, getEnrollment } = useCourses()
  const [editing, setEditing] = useState(false)
  // Module 12 — platform-issued certificates come from the backend certificate
  // API (role-scoped to the trainee), never from localStorage or mock data.
  const [platformCerts, setPlatformCerts] = useState(null) // null = loading

  useEffect(() => {
    if (currentUser?.role !== 'TRAINEE') return
    let cancelled = false
    listCertificates()
      .then((rows) => {
        if (!cancelled) setPlatformCerts(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setPlatformCerts([])
      })
    return () => {
      cancelled = true
    }
  }, [currentUser?.role])

  const completedCourses = courseCatalog.filter(
    (c) => getEnrollment(c.id)?.status === 'completed',
  )
  const certs = platformCerts ?? []
  const scored = certs.map((c) => Number(c.score)).filter((n) => !Number.isNaN(n))
  const averageScore = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0

  const completion = Number(currentUser?.profileCompletion) || 0
  const profCerts = Array.isArray(currentUser?.certifications) ? currentUser.certifications : []
  const skills = Array.isArray(currentUser?.skills) ? currentUser.skills : []
  const quals = Array.isArray(currentUser?.qualifications) ? currentUser.qualifications : []
  const ach = Array.isArray(currentUser?.achievements) ? currentUser.achievements : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-light to-white" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary text-3xl font-semibold text-white shadow-lg">
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              currentUser?.name?.charAt(0)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-primary-deep">{currentUser?.name}</h2>
              {currentUser?.status === 'approved' ? (
                <Badge tone="green"><BadgeCheck size={13} /> Verified</Badge>
              ) : currentUser?.status === 'pending' ? (
                <Badge tone="amber"><Clock size={13} /> Pending Verification</Badge>
              ) : (
                <Badge tone="red"><BadgeCheck size={13} /> Rejected</Badge>
              )}
            </div>
            <p className="text-sm text-slate-body">{currentUser?.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-muted">
              <span className="inline-flex items-center gap-1"><MapPin size={13} /> {currentUser?.station} Weather Station</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> {currentUser?.department}</span>
              <span className="inline-flex items-center gap-1"><GraduationCap size={13} /> {currentUser?.empId}</span>
            </div>
          </div>
          <Button onClick={() => setEditing(true)}><Pencil size={15} /> Edit Profile</Button>
        </div>
        <div className="relative mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-primary-deep">Profile Completion</span>
            <span className="font-medium text-primary">{completion}%</span>
          </div>
          <div className="mt-1"><ProgressBar value={completion} /></div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left col */}
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <ShieldCheck size={17} className="text-primary" /> Identity & Readiness
            </h3>
            <div className="mt-3 space-y-2 text-sm">
              <InfoRow label="Govt/Department ID" value={currentUser?.empId} />
              <InfoRow label="Regional Station" value={currentUser?.station} />
              <InfoRow label="Region" value={currentUser?.region || '—'} />
              <InfoRow label="Department" value={currentUser?.department} />
              <InfoRow label="Organization" value={currentUser?.organization || '—'} />
              <InfoRow label="Role" value={currentUser?.role} />
              <InfoRow
                label="Verification"
                value={
                  currentUser?.status === 'approved'
                    ? 'Approved ✓'
                    : currentUser?.status === 'pending'
                      ? 'Pending review'
                      : 'Rejected'
                }
              />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <Award size={17} className="text-primary" /> Badges & Achievements
            </h3>
            <div className="mt-4 space-y-3">
              {ach.length ? ach.map((a, i) => (
                <Achievement key={i} icon={Star} title={a} sub="Professional achievement" />
              )) : (
                <Achievement icon={Award} title="Forecast Fundamentals" sub="Course Completed" />
              )}
            </div>
          </Card>

          {/* Profile completion detail */}
          <Card className="p-5">
            <h3 className="font-semibold text-primary-deep">Professional Profile</h3>
            <div className="mt-3 space-y-2 text-sm">
              {currentUser?.professionalSummary ? (
                <p className="text-slate-body">{currentUser.professionalSummary}</p>
              ) : (
                <p className="text-slate-muted italic">No professional summary added.</p>
              )}
              <InfoRow label="Experience" value={currentUser?.yearsOfExperience || currentUser?.experience || '—'} />
            </div>
            {skills.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-primary-deep">Skills</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {skills.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}
                </div>
              </div>
            )}
            {quals.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-primary-deep">Qualifications</p>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-body">
                  {quals.map((q, i) => <li key={i}>• {q}</li>)}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* Right col */}
        <div className="space-y-5 lg:col-span-2">
          {/* Professional certifications (uploaded by user) */}
          <CertificationManager uid={currentUser?.uid} certifications={profCerts} />

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <BookOpen size={17} className="text-primary" /> Completed Courses
            </h3>
            {completedCourses.length ? (
              <div className="mt-4 space-y-3">
                {completedCourses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-sky-soft p-4">
                    <div>
                      <p className="font-medium text-primary-deep">{c.title}</p>
                      <p className="text-xs text-slate-muted">{c.domain}</p>
                    </div>
                    <Badge tone="green">Completed</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-muted">No completed courses yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <GraduationCap size={17} className="text-primary" /> Course Completion Certificates
            </h3>
            {platformCerts === null ? (
              <p className="mt-3 text-sm text-slate-muted">Loading certificates…</p>
            ) : certs.length ? (
              <div className="mt-4 space-y-3">
                {certs.map((cert) => {
                  const matched = courseCatalog.find((c) => String(c.id) === String(cert.courseId))
                  const trainer = matched?.trainer || ''
                  const courseTitle = cert.courseTitle || matched?.title || 'Course'
                  return (
                    <div key={cert.id || cert.certificateNumber} className="flex items-center justify-between rounded-xl border border-border-soft bg-sky-soft p-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white"><Award size={18} /></span>
                        <div>
                          <p className="font-medium text-primary-deep">{courseTitle} — Certificate</p>
                          <p className="text-xs text-slate-muted">{cert.certificateNumber} · {formatDate(cert.issuedOn)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge tone="green">Score {cert.score != null ? `${cert.score}%` : '—'}</Badge>
                        <button
                          onClick={() => exportCertificatePDF({
                            traineeName: cert.traineeName || currentUser?.name || 'Trainee',
                            courseName: courseTitle,
                            completionDate: cert.issuedOn,
                            certId: cert.certificateNumber,
                            trainer,
                            score: cert.score ?? 0,
                          })}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light"
                        >
                          <Download size={14} /> PDF
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-muted">No course completion certificates yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-primary-deep">Competency Record</h3>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-sm"><span className="text-slate-body">Scientific Competency (avg)</span><span className="font-medium text-primary">{Math.round(averageScore)}%</span></div>
                <div className="mt-1"><ProgressBar value={averageScore} /></div>
              </div>
              <p className="text-xs text-slate-muted">
                Your competency record reflects verified assessment performance across completed courses.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ProfileEditor open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-border-subtle pb-2">
      <span className="text-slate-muted">{label}</span>
      <span className="font-medium text-primary-deep">{value}</span>
    </div>
  )
}

function Achievement({ icon: Icon, title, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-sky-soft p-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-primary"><Icon size={16} /></span>
      <div>
        <p className="text-sm font-medium text-primary-deep">{title}</p>
        <p className="text-xs text-slate-muted">{sub}</p>
      </div>
    </div>
  )
}
