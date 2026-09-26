import { useEffect, useMemo, useState } from 'react'
import { Briefcase, CheckCircle2, GitCompareArrows } from 'lucide-react'
import { Card, Badge, EmptyState } from '../common/ui'
import { DOMAINS, courses as mockCourses, trainers } from '../../data/mockData'
import { rankTrainersForDomain } from '../../utils/matchingAlgorithm'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { DEMO_MODE } from '../../utils/demoDataMode'
import * as userApi from '../../services/userApi'

const DOMAIN_OPTIONS = Array.from(new Set([...DOMAINS, ...mockCourses.map((c) => c.domain)]))

// Tokenize a real backend profile into the free-text evidence a domain match
// can legitimately use (there is no fake rating / availability / feedback data).
function profileTokens(p) {
  const tokens = []
  for (const field of ['expertise', 'specializations', 'skills', 'trainingInterests']) {
    for (const t of Array.isArray(p?.[field]) ? p[field] : []) {
      if (t) tokens.push(String(t).toLowerCase())
    }
  }
  if (p?.title) tokens.push(String(p.title).toLowerCase())
  for (const q of Array.isArray(p?.qualifications) ? p.qualifications : []) {
    if (q) tokens.push(String(q).toLowerCase())
  }
  return tokens
}

// Honest backend match: overlap of REAL profile evidence with the selected
// domain (+ real years of experience). Percentages are derived, never invented.
function scoreTrainer(p, domain) {
  const terms = String(domain || '')
    .toLowerCase()
    .split(/[\s,/-]+/)
    .filter((t) => t.length > 1)
  const tokens = profileTokens(p)
  const hits = terms.length
    ? tokens.filter((t) => terms.some((term) => t.includes(term) || term.includes(t)))
    : []
  const domainPct = hits.length ? Math.min(100, Math.round((Math.min(hits.length, 3) / 3) * 100)) : 0
  const years = Math.max(0, Number(p?.yearsOfExperience) || 0)
  const experiencePct = Math.min(100, Math.round((years / 10) * 100))
  return {
    percentage: Math.round(domainPct * 0.7 + experiencePct * 0.3),
    breakdown: { domain: domainPct, experience: experiencePct },
  }
}

export default function CompetencyMatcher() {
  const { currentUser } = useAuth()
  const { courses } = useCourses()
  const backendActive = Boolean(currentUser && currentUser.authSource === 'supabase')
  // DEV demo mode: this is a read-only ranking surface, so a REAL admin session
  // still ranks the seeded trainer roster with realistic names when the flag is
  // on. The backend directory stays authoritative whenever the flag is off.
  const realSource = backendActive && !DEMO_MODE
  const [domain, setDomain] = useState('')
  const [trainerProfiles, setTrainerProfiles] = useState(null) // null = loading

  // Real backend directory of APPROVED trainers (ADMIN endpoint). Loaded once
  // so the matcher never shows the seed/demo trainer roster to real admins (except
  // when DEV demo mode is explicitly enabled).
  useEffect(() => {
    if (!realSource) return
    let mounted = true
    userApi
      .listUsers()
      .then((data) => {
        const all = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : []
        const approvedTrainers = all.filter(
          (u) => u.role === 'TRAINER' && u.approvalStatus === 'APPROVED',
        )
        if (mounted) setTrainerProfiles(approvedTrainers)
      })
      .catch(() => {
        if (mounted) setTrainerProfiles([])
      })
    return () => {
      mounted = false
    }
  }, [realSource])

  // Real domain list where available (from the live course catalog); the mock
  // DOMAINS stay only as the dev-mock fallback.
  const domainOptions = useMemo(() => {
    const fromCourses = new Set((courses || []).map((c) => c.domain).filter(Boolean))
    return Array.from(new Set([...fromCourses, ...DOMAIN_OPTIONS]))
  }, [courses])

  const ranked = useMemo(() => {
    if (!domain) return []
    if (realSource) {
      return (trainerProfiles || [])
        .map((p) => ({ trainer: p, match: scoreTrainer(p, domain) }))
        .sort((a, b) => b.match.percentage - a.match.percentage)
    }
    return rankTrainersForDomain(trainers, domain)
  }, [domain, realSource, trainerProfiles])

  const noMatch = domain && ranked.length === 0
  const loadingBackend = realSource && trainerProfiles === null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">Trainer-to-Subject Matching Engine</h2>
        <p className="text-sm text-slate-muted">
          {realSource
            ? 'Ranking real approved trainers by their recorded expertise and experience against each domain.'
            : 'Weighted recommendation combining domain expertise, feedback, rating, availability, and past performance.'}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-body">Select domain:</span>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="flex-1 rounded-lg border border-border-soft bg-sky-soft px-3 py-2 text-sm outline-none focus:border-secondary"
          >
            <option value="">Select a domain…</option>
            {domainOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {domain && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>{domain}</Badge>
          </div>
        )}
      </Card>

      {!domain ? (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="Select a domain to begin"
            description="Choose a domain above to rank trainers by their relevance and expertise."
          />
        </Card>
      ) : loadingBackend ? (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="Loading trainers"
            description="Fetching the approved trainer directory…"
          />
        </Card>
      ) : noMatch ? (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="No matching trainers"
            description="No trainers matched this domain. Try selecting another domain."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {ranked.map(({ trainer, match }, i) => (
            <Card key={trainer.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-sky-light text-lg font-semibold text-primary">
                    {(trainer.name || 'T').charAt(0)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-primary-deep">{trainer.name || 'Trainer'}</h4>
                      {i === 0 && <Badge tone="green"><CheckCircle2 size={12} /> Best Match</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-muted">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase size={13} /> {realSource
                          ? (trainer.yearsOfExperience ? `${trainer.yearsOfExperience} yrs` : '—')
                          : (trainer.experience || '—')}
                      </span>
                      {!realSource && trainer.rating != null && (
                        <span>{trainer.rating} rating</span>
                      )}
                      {realSource && trainer.station && <span>{trainer.station}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold text-primary">{match.percentage}%</p>
                  <p className="text-xs text-slate-muted">match</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {(realSource
                  ? [...(trainer.expertise || []), ...(trainer.specializations || [])]
                  : (trainer.expertise || [])
                ).map((e) => <Badge key={e}>{e}</Badge>)}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {realSource ? (
                  <>
                    <Factor label="Domain" val={match.breakdown.domain} />
                    <Factor label="Experience" val={match.breakdown.experience} />
                  </>
                ) : (
                  <>
                    <Factor label="Domain" val={match.breakdown.domain} />
                    <Factor label="Feedback" val={match.breakdown.feedback} />
                    <Factor label="Rating" val={match.breakdown.rating} />
                    <Factor label="Availability" val={match.breakdown.availability} />
                    <Factor label="Experience" val={match.breakdown.experience} />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Factor({ label, val }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-sky-soft p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-muted">{label}</span>
        <span className="text-sm font-semibold text-primary">{val}%</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-[#EAF0F6]">
        <div className="h-1.5 rounded-full bg-secondary" style={{ width: `${val}%` }} />
      </div>
    </div>
  )
}