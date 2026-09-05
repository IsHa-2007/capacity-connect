import { useMemo, useState } from 'react'
import { CheckCircle2, Star, Briefcase, GitCompareArrows } from 'lucide-react'
import { Card, Badge, EmptyState } from '../common/ui'
import { DOMAINS, courses, trainers } from '../../data/mockData'
import { rankTrainersForDomain } from '../../utils/matchingAlgorithm'

const DOMAIN_OPTIONS = Array.from(new Set([...DOMAINS, ...courses.map((c) => c.domain)]))

export default function CompetencyMatcher() {
  const [domain, setDomain] = useState('')

  const ranked = useMemo(
    () => (domain ? rankTrainersForDomain(trainers, domain) : []),
    [domain],
  )

  const noMatch = domain && ranked.length === 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">Trainer-to-Subject Matching Engine</h2>
        <p className="text-sm text-slate-muted">
          Weighted recommendation combining domain expertise, feedback, rating, availability, and past performance.
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
            {DOMAIN_OPTIONS.map((d) => (
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
                    {trainer.name.charAt(0)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-primary-deep">{trainer.name}</h4>
                      {i === 0 && <Badge tone="green"><CheckCircle2 size={12} /> Best Match</Badge>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-muted">
                      <span className="inline-flex items-center gap-1"><Briefcase size={13} /> {trainer.experience}</span>
                      <span className="inline-flex items-center gap-1"><Star size={13} /> {trainer.rating}</span>
                      <span>{trainer.availability ? 'Available' : 'Unavailable'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold text-primary">{match.percentage}%</p>
                  <p className="text-xs text-slate-muted">match</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {trainer.expertise.map((e) => <Badge key={e}>{e}</Badge>)}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                <Factor label="Domain" val={match.breakdown.domain} />
                <Factor label="Feedback" val={match.breakdown.feedback} />
                <Factor label="Rating" val={match.breakdown.rating} />
                <Factor label="Availability" val={match.breakdown.availability} />
                <Factor label="Experience" val={match.breakdown.experience} />
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