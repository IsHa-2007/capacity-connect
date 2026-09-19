import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  Users,
  XCircle,
} from 'lucide-react'
import { Badge, Button, EmptyState, LoadingState, ProgressBar } from '../common/ui'
import { isApiHttpError } from '../../services/api'
import * as analyticsApi from '../../services/analyticsApi'
import * as userApi from '../../services/userApi'

// MODULE 17A/17B — REGIONAL OFFICER DISPATCH PANEL
//
// Natural extension of the Regional Heatmap: an ADMIN picks a capability for the
// selected region, discovers the real approved officers who hold it, reviews the
// ranked candidates and their transparent match breakdown, then confirms a
// dispatch. All eligibility and scoring are backend-authoritative. A confirmed
// dispatch is PERSISTED to the duty assignment table and the assigned officers
// are notified; the roster below reflects that persisted state and drives the
// ASSIGNED -> IN_PROGRESS -> COMPLETED / CANCELLED lifecycle.

const STATUS_BADGE = {
  ASSIGNED: { tone: 'blue', label: 'Assigned' },
  IN_PROGRESS: { tone: 'amber', label: 'In progress' },
  COMPLETED: { tone: 'green', label: 'Completed' },
  CANCELLED: { tone: 'slate', label: 'Cancelled' },
}

const NEXT_ACTIONS = {
  ASSIGNED: [
    { to: 'IN_PROGRESS', label: 'Start', icon: PlayCircle, variant: 'soft' },
    { to: 'CANCELLED', label: 'Cancel', icon: XCircle, variant: 'outline' },
  ],
  IN_PROGRESS: [
    { to: 'COMPLETED', label: 'Complete', icon: CheckCircle2, variant: 'soft' },
    { to: 'CANCELLED', label: 'Cancel', icon: XCircle, variant: 'outline' },
  ],
}

function initials(name = '') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}

function MatchMetric({ label, value }) {
  const missing = value === null || value === undefined
  return (
    <span className="flex items-center justify-between gap-2 rounded-lg bg-sky-soft/70 px-2.5 py-1.5">
      <span className="text-slate-muted">{label}</span>
      <span className={missing ? 'font-medium text-slate-muted' : 'font-semibold text-primary-deep'}>
        {missing ? 'No data' : `${value}%`}
      </span>
    </span>
  )
}

export default function OfficerDispatchPanel({ region, regions = [], backendActive = false }) {
  const [capability, setCapability] = useState('')
  const [requiredCount, setRequiredCount] = useState(1)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dispatch, setDispatch] = useState({ status: 'idle', message: '', details: null })
  const [station, setStation] = useState('')
  const [roster, setRoster] = useState({ status: 'idle', items: [], error: '' })
  const [rowBusy, setRowBusy] = useState('')
  const [selectedRegionName, setSelectedRegionName] = useState(region?.name || '')
  const [approvedUsers, setApprovedUsers] = useState([])

  // Region options reuse the SAME real region data already rendered by the
  // Regional Heatmap — never a second, hardcoded region list.
  const regionOptions = regions.length ? regions : region ? [region] : []
  const selectedRegion =
    regionOptions.find((r) => r.name === selectedRegionName) || region || regionOptions[0] || null
  const regionName = selectedRegion?.name || ''

  // Real capabilities come from approved users' persisted profile arrays (the
  // exact fields the backend matcher compares against) plus any real heatmap
  // domains — never a hardcoded skill list.
  useEffect(() => {
    if (!backendActive) return
    let active = true
    userApi
      .listUsers()
      .then((data) => {
        if (active) setApprovedUsers((data?.users || []).filter((u) => u.approvalStatus === 'APPROVED'))
      })
      .catch(() => {
        if (active) setApprovedUsers([])
      })
    return () => {
      active = false
    }
  }, [backendActive])

  const capabilities = useMemo(() => {
    const set = new Set()
    for (const user of approvedUsers) {
      for (const field of ['expertise', 'specializations', 'skills']) {
        for (const value of user[field] || []) {
          const v = String(value || '').trim()
          if (v) set.add(v)
        }
      }
    }
    ;(selectedRegion?.gaps || []).forEach((g) => g && set.add(g))
    ;(selectedRegion?.stationRows || []).forEach((s) =>
      (s.domainBreakdown || []).forEach((d) => d.domain && set.add(d.domain)),
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [approvedUsers, selectedRegion])

  // Station options are the verified stations attached to the selected region
  // (sourced from station_region_map via the existing regional analytics).
  const stationOptions = useMemo(
    () =>
      selectedRegion?.stations ||
      (selectedRegion?.stationRows || []).map((s) => s.station).filter(Boolean),
    [selectedRegion],
  )

  const loadRoster = useCallback(async () => {
    if (!backendActive || !regionName) return
    setRoster((prev) => ({ ...prev, status: 'loading', error: '' }))
    try {
      const data = await analyticsApi.listAssignments({ region: regionName })
      setRoster({ status: 'ready', items: data.assignments || [], error: '' })
    } catch (err) {
      setRoster({
        status: 'error',
        items: [],
        error: isApiHttpError(err) ? err.message : 'Unable to load the duty roster.',
      })
    }
  }, [backendActive, regionName])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  function invalidate() {
    setResult(null)
    setSelected([])
    setError('')
    setDispatch({ status: 'idle', message: '', details: null })
  }

  function changeRegion(name) {
    setSelectedRegionName(name)
    setStation('')
    invalidate()
  }

  async function findOfficers(event) {
    event.preventDefault()
    const cap = capability.trim()
    if (!cap) {
      setError('Select a capability to search for.')
      return
    }
    setLoading(true)
    setError('')
    setDispatch({ status: 'idle', message: '', details: null })
    try {
      const data = await analyticsApi.findOfficerMatches({
        regionKey: regionName,
        capability: cap,
        requiredCount: Number(requiredCount) || 1,
      })
      setResult(data)
      setSelected([])
    } catch (err) {
      setResult(null)
      setSelected([])
      setError(isApiHttpError(err) ? err.message : 'Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleOfficer(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      const limit = result?.requiredCount || Number(requiredCount) || 1
      if (prev.length >= limit) return prev
      return [...prev, id]
    })
  }

  async function confirmDispatch() {
    if (!result || !selected.length) return
    setDispatch({ status: 'working', message: '', details: null })
    try {
      const data = await analyticsApi.dispatchOfficers({
        regionKey: result.regionKey,
        capability: result.capability,
        requiredCount: result.requiredCount,
        station: station.trim() || undefined,
        officerIds: selected,
      })
      const count = data?.assignments?.length ?? selected.length
      const notified = data?.notificationsSent ?? 0
      setDispatch({
        status: 'success',
        message: `Dispatched ${count} officer${count === 1 ? '' : 's'} for ${result.capability} in ${result.regionKey}; ${notified} notification${notified === 1 ? '' : 's'} sent.`,
        details: null,
      })
      setSelected([])
      await loadRoster()
    } catch (err) {
      const http = isApiHttpError(err)
      setDispatch({
        status: 'error',
        message: http ? err.message : 'Unable to reach the server. Please try again.',
        details: http ? err.details : null,
      })
    }
  }

  async function changeStatus(assignmentId, status) {
    setRowBusy(assignmentId)
    setDispatch({ status: 'idle', message: '', details: null })
    try {
      await analyticsApi.updateAssignmentStatus(assignmentId, status)
      await loadRoster()
    } catch (err) {
      setRoster((prev) => ({
        ...prev,
        error: isApiHttpError(err) ? err.message : 'Unable to update the duty assignment.',
      }))
    } finally {
      setRowBusy('')
    }
  }

  const selectionLimit = result?.requiredCount || Number(requiredCount) || 1

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
          <Users size={18} className="text-secondary" /> Regional Officer Dispatch
        </h3>
      </div>
      <p className="mt-1 text-sm text-slate-muted">
        Find approved officers who hold a required capability in this region, review their match, and dispatch.
      </p>

      {!backendActive ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border-subtle bg-sky-soft px-3 py-2 text-sm text-slate-body">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" />
          <span>Officer discovery is available when this deployment is connected to the capacity backend.</span>
        </div>
      ) : (
        <>
          <form className="mt-4 space-y-3" onSubmit={findOfficers}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Region</span>
                <select
                  value={selectedRegion?.name || ''}
                  onChange={(e) => changeRegion(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-primary-deep focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {regionOptions.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Required capability</span>
                <select
                  value={capability}
                  onChange={(e) => {
                    setCapability(e.target.value)
                    invalidate()
                  }}
                  className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-primary-deep focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">
                    {capabilities.length ? 'Select a capability' : 'No capabilities on record'}
                  </option>
                  {capabilities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Station (optional)</span>
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm text-primary-deep focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Any station in region</option>
                  {stationOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Officers needed</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={requiredCount}
                  onChange={(e) => {
                    setRequiredCount(e.target.value)
                    invalidate()
                  }}
                  className="mt-1 w-full rounded-lg border border-border-soft px-3 py-2 text-sm text-primary-deep focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <Button
                type="submit"
                disabled={loading || !capability}
                className="w-full justify-center whitespace-nowrap sm:col-span-2 lg:col-span-1"
              >
                <Search size={16} /> {loading ? 'Searching…' : 'Find officers'}
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && <LoadingState />}

          {!loading && result && (
            <div className="mt-4">
              {result.eligibleCount === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No eligible officers found for this capability in this region."
                  description="No approved officer in this region lists a matching capability."
                />
              ) : (
                <>
                  {result.shortage && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>
                        Only {result.eligibleCount} eligible officer{result.eligibleCount === 1 ? '' : 's'} were found for the
                        requested {result.requiredCount}.
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {result.officers.map((officer) => {
                      const checked = selected.includes(officer.id)
                      const disabled = !checked && selected.length >= selectionLimit
                      return (
                        <label
                          key={officer.id}
                          className={`block cursor-pointer rounded-xl border transition-colors ${
                            checked ? 'border-primary bg-sky-light' : 'border-border-soft hover:bg-sky-soft'
                          } ${disabled ? 'opacity-60' : ''}`}
                        >
                          <span className="flex items-start gap-3 p-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleOfficer(officer.id)}
                              className="mt-1 h-4 w-4 shrink-0 accent-[#004AAD]"
                            />
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-semibold text-white">
                              {initials(officer.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-primary-deep">{officer.name}</span>
                                <Badge tone="slate">{officer.role}</Badge>
                                {officer.station && <Badge tone="blue">{officer.station}</Badge>}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-muted">
                                {officer.title || '—'}
                                {officer.yearsOfExperience ? ` · ${officer.yearsOfExperience} experience` : ''}
                              </span>
                            </span>
                            <span className="ml-auto shrink-0 pl-2 text-right">
                              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-muted">
                                Match
                              </span>
                              <span className="text-lg font-semibold text-primary">{officer.match.score}%</span>
                            </span>
                          </span>
                          <span className="block border-t border-border-subtle px-3 py-3">
                            <span className="grid gap-1.5 text-xs sm:grid-cols-3">
                              <MatchMetric label="Capability" value={officer.match.breakdown.domain} />
                              <MatchMetric label="Feedback" value={officer.match.breakdown.feedback} />
                              <MatchMetric label="History" value={officer.match.breakdown.history} />
                            </span>
                            <span className="mt-2 block">
                              <ProgressBar value={officer.match.score} />
                            </span>
                            {officer.match.reasons?.length > 0 && (
                              <span className="mt-2 block text-xs text-slate-body">{officer.match.reasons.join(' · ')}</span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-border-subtle bg-sky-soft px-3 py-2 text-xs text-slate-body">
                    <Info size={14} className="mt-0.5 shrink-0 text-primary" />
                    <span>
                      Rating and availability are not stored in the capacity database, so they are excluded from the score
                      rather than estimated. The remaining signals are re-weighted.
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-slate-body">
                      {selected.length} of {selectionLimit} selected
                    </span>
                    <Button variant="secondary" onClick={confirmDispatch} disabled={!selected.length || dispatch.status === 'working'}>
                      <Send size={16} /> {dispatch.status === 'working' ? 'Dispatching…' : 'Confirm dispatch'}
                    </Button>
                  </div>

                  {dispatch.status === 'success' && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      <span>{dispatch.message}</span>
                    </div>
                  )}

                  {dispatch.status === 'error' && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>
                        {dispatch.message}
                        {dispatch.details?.reason ? <> {dispatch.details.reason}</> : null}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-6 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-primary-deep">
                <Users size={16} className="text-secondary" /> Duty roster
                {roster.status === 'ready' && (
                  <Badge tone="slate">
                    {roster.items.length} assignment{roster.items.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </h4>
              <Button variant="ghost" onClick={loadRoster} disabled={roster.status === 'loading'}>
                <RefreshCw size={14} className={roster.status === 'loading' ? 'animate-spin' : ''} /> Refresh
              </Button>
            </div>

            {roster.error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{roster.error}</span>
              </div>
            )}

            {roster.status === 'loading' && roster.items.length === 0 ? (
              <LoadingState />
            ) : roster.items.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-border-soft bg-sky-soft/50 px-4 py-8 text-center">
                <Users size={22} className="mx-auto text-slate-muted" />
                <p className="mt-2 text-sm font-medium text-slate-body">
                  No officers are currently assigned for this region.
                </p>
                <p className="mt-0.5 text-xs text-slate-muted">Dispatched officers will appear here.</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {roster.items.map((assignment) => {
                  const badge = STATUS_BADGE[assignment.status] || STATUS_BADGE.ASSIGNED
                  const actions = NEXT_ACTIONS[assignment.status] || []
                  return (
                    <div
                      key={assignment.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border-soft px-3 py-2.5"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-semibold text-white">
                        {initials(assignment.officerName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-primary-deep">{assignment.officerName || 'Unknown officer'}</span>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          <Badge tone="blue">{assignment.capability}</Badge>
                          {assignment.station && <Badge tone="slate">{assignment.station}</Badge>}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-muted">
                          Assigned by {assignment.assignedByName || '—'}
                          {assignment.assignedAt ? ` · ${new Date(assignment.assignedAt).toLocaleString()}` : ''}
                        </span>
                      </span>
                      {actions.length > 0 && (
                        <span className="flex w-full flex-wrap justify-end gap-2 sm:w-auto sm:flex-nowrap">
                          {actions.map((action) => (
                            <Button
                              key={action.to}
                              variant={action.variant}
                              onClick={() => changeStatus(assignment.id, action.to)}
                              disabled={rowBusy === assignment.id}
                            >
                              <action.icon size={14} /> {action.label}
                            </Button>
                          ))}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
