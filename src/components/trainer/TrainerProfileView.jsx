import { useState } from 'react'
import { Award, BookOpen, Clock, GraduationCap, MapPin, Pencil, Star, Users } from 'lucide-react'
import { Card, Badge, Button, ProgressBar } from '../common/ui'
import { useAuth } from '../../context/AuthContext'
import { useTrainer } from '../../context/TrainerContext'
import { useCourses } from '../../context/CourseContext'
import ProfileEditor from '../profile/ProfileEditor'
import CertificationManager from '../profile/CertificationManager'

export default function TrainerProfileView() {
  const { currentUser } = useAuth()
  const { trainerList, analytics } = useTrainer()
  const { myCourses } = useCourses()
  const [editing, setEditing] = useState(false)

  const me = trainerList.find((t) => t.name === currentUser?.name)

  if (!currentUser) return null

  const expertise = me?.expertise || currentUser.expertise || []
  const specializations = Array.isArray(currentUser?.specializations) ? currentUser.specializations : []
  const station = me?.station || currentUser.station || '—'
  const experience = me?.experience || currentUser.yearsOfExperience || currentUser.experience || '—'
  const completion = Number(currentUser?.profileCompletion) || 0
  const profCerts = Array.isArray(currentUser?.certifications) ? currentUser.certifications : []
  const quals = Array.isArray(currentUser?.qualifications) ? currentUser.qualifications : []
  const skills = Array.isArray(currentUser?.skills) ? currentUser.skills : []

  const avgAll =
    analytics.feedbackCount > 0
      ? (
          (analytics.feedbackRatings.contentDepth +
            analytics.feedbackRatings.trainerDelivery +
            analytics.feedbackRatings.operationalRelevance) /
          (3 * analytics.feedbackCount)
        ).toFixed(1)
      : '—'

  const factorAvg = (k) =>
    analytics.feedbackCount > 0
      ? (analytics.feedbackRatings[k] / analytics.feedbackCount).toFixed(1)
      : '—'

  const traineesMentored = analytics.activeTrainees

  // A trainer's rating must come from REAL trainee feedback (the same numbers
  // rendered below), never a hardcoded fallback like the seed-data 4.0.
  const isBackendProfile = currentUser?.authSource === 'supabase'
  const rating = isBackendProfile ? (avgAll !== '—' ? avgAll : null) : me?.rating ?? null

  return (
    <div className="space-y-6">
      {currentUser?.status === 'pending' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Clock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Your account is awaiting administrative approval.</p>
            <p className="mt-0.5">
              Operational features will unlock after verification. You can maintain your professional
              profile while your account is under review.
            </p>
          </div>
        </div>
      )}
      <Card className="p-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary text-3xl font-semibold text-white">
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              currentUser.name.charAt(0)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-primary-deep">{currentUser.name}</h2>
              {currentUser?.status === 'approved' ? (
                <Badge tone="green">Verified Trainer</Badge>
              ) : currentUser?.status === 'pending' ? (
                <Badge tone="amber"><Clock size={13} /> Pending Verification</Badge>
              ) : (
                <Badge tone="red">Rejected</Badge>
              )}
            </div>
            <p className="text-sm text-slate-body">{currentUser.title || 'Trainer'} · {experience} experience</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-muted">
              <span className="inline-flex items-center gap-1"><MapPin size={13} /> {station}</span>
              <span className="inline-flex items-center gap-1"><GraduationCap size={13} /> {currentUser.department}</span>
              {rating != null && <span className="inline-flex items-center gap-1"><Star size={13} /> {rating} rating</span>}
            </div>
          </div>
          <Button onClick={() => setEditing(true)}><Pencil size={15} /> Edit Profile</Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
          {expertise.length ? expertise.map((e) => <Badge key={e} tone="blue">{e}</Badge>) : <span className="text-xs text-slate-muted">No expertise tags set.</span>}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-primary-deep">Profile Completion</span>
            <span className="font-medium text-primary">{completion}%</span>
          </div>
          <div className="mt-1"><ProgressBar value={completion} /></div>
        </div>
      </Card>

      {/* Professional certifications (uploaded by user) */}
      <CertificationManager uid={currentUser.uid} certifications={profCerts} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={Award} label="Courses Created" value={analytics.courses} />
        <Metric icon={Users} label="Trainees Mentored" value={traineesMentored} />
        <Metric icon={Star} label="Avg. Feedback" value={avgAll !== '—' ? `${avgAll} / 5` : '—'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep"><BookOpen size={17} className="text-primary" /> Scientific Domain Expertise</h3>
          <div className="mt-4 space-y-3">
            {expertise.length ? expertise.map((e) => (
              <div key={e} className="flex items-center justify-between rounded-xl border border-border-subtle bg-sky-soft px-4 py-3">
                <span className="text-sm font-medium text-primary-deep">{e}</span>
                <Badge tone="green">Expert</Badge>
              </div>
            )) : (
              <p className="text-sm text-slate-muted">No expertise recorded.</p>
            )}
          </div>
          {specializations.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-primary-deep">Specializations</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {specializations.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}
              </div>
            </div>
          )}
          {skills.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-primary-deep">Skills</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {skills.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}
              </div>
            </div>
          )}
          {quals.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-primary-deep">Qualifications</p>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-body">
                {quals.map((q, i) => <li key={i}>• {q}</li>)}
              </ul>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-primary-deep">Trainee Ratings (from real feedback)</h3>
          <div className="mt-4 space-y-3">
            {[
              { label: 'Content Depth', val: factorAvg('contentDepth') },
              { label: 'Trainer Delivery', val: factorAvg('trainerDelivery') },
              { label: 'Operational Relevance', val: factorAvg('operationalRelevance') },
            ].map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-sm"><span className="text-slate-body">{f.label}</span><span className="font-medium text-primary">{f.val === '—' ? '—' : f.val}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-[#EAF0F6]"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${(Number(f.val) || 0) * 20}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-blue-100 bg-sky-light p-3 text-xs text-primary-deep">
            <Star size={13} className="inline" /> Ratings are computed exclusively from real trainee feedback submitted after assessments.
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-primary-deep">Course History</h3>
        {myCourses.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {myCourses.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-sky-soft px-4 py-3">
                <div>
                  <Badge>{c.domain}</Badge>
                  <p className="mt-1 text-sm font-medium text-primary-deep">{c.title}</p>
                </div>
                <Badge tone={c.status === 'published' ? 'green' : 'slate'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-muted">No courses created yet.</p>
        )}
      </Card>

      <ProfileEditor open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

function Metric({ icon: Icon, label, value }) {
  return (
    <Card className="p-5 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-sky-light text-primary"><Icon size={18} /></span>
      <p className="mt-2 text-2xl font-semibold text-primary-deep">{value}</p>
      <p className="text-xs text-slate-muted">{label}</p>
    </Card>
  )
}
