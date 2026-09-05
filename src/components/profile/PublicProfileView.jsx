import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Award,
  BadgeCheck,
  Building2,
  ChevronLeft,
  GraduationCap,
  MapPin,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, Card } from '../common/ui'

// Public profile view. Shows only professional/public details gathered from the
// user's directory entry and full profile — never sensitive account data such as
// passwords, credentials or internal approval workflow fields.
export default function PublicProfileView({ backTo }) {
  const { uid } = useParams()
  const navigate = useNavigate()
  const { getProfileByUid, currentUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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

  const roleLabel = { TRAINEE: 'Trainee', TRAINER: 'Trainer', ADMIN: 'Admin' }
  const isSelf = currentUser && (currentUser.uid === profile?.uid)

  const goBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <div className="space-y-6">
      <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-slate-muted hover:text-primary">
        <ChevronLeft size={16} /> Back
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
              <Chips values={profile.expertise} empty="No domain expertise listed" />
            </Section>
            <Section icon={Target} title="Specializations">
              <Chips values={profile.specializations} empty="No specializations listed" />
            </Section>
            <Section icon={GraduationCap} title="Qualifications">
              <Chips values={profile.qualifications} empty="No qualifications listed" />
            </Section>
            <Section icon={Award} title="Achievements">
              <Chips values={profile.achievements} empty="No achievements listed" />
            </Section>
          </div>

          {Array.isArray(profile.skills) && profile.skills.length > 0 && (
            <Section icon={UserRound} title="Skills">
              <Chips values={profile.skills} empty="No skills listed" />
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
