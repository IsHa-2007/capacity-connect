import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Map as MapIcon, TrendingUp } from 'lucide-react'
import { Card, Badge, ProgressBar } from '../common/ui'
import { useCourses } from '../../context/CourseContext'
import { useAuth } from '../../context/AuthContext'
import { DEMO_MODE } from '../../utils/demoDataMode'
import { regionalCompetency } from '../../data/mockData'
import * as analyticsApi from '../../services/analyticsApi'
import OfficerDispatchPanel from './OfficerDispatchPanel'

const REGION_ORDER = ['North', 'West', 'East', 'South']

// Blue shade scale (higher competency = deeper blue); grey when there is no
// real sample — a region/station is never coloured as if it had data.
function shadeColor(competency) {
  if (competency == null) return '#94A3B8'
  if (competency >= 80) return '#123a5c'
  if (competency >= 70) return '#1F5F93'
  if (competency >= 60) return '#4E84B7'
  return '#7EA8CC'
}

function shadeBg(competency) {
  if (competency == null) return 'bg-[#94A3B8] text-white'
  if (competency >= 80) return 'bg-[#123a5c] text-white'
  if (competency >= 70) return 'bg-[#1F5F93] text-white'
  if (competency >= 60) return 'bg-[#4E84B7] text-white'
  return 'bg-[#7EA8CC] text-white'
}

function pct(value) {
  return value == null ? 'No data' : `${value}%`
}

// Maps the backend /analytics/regional payload into the component's region
// model. Regions without real assessment results stay competency=null.
function regionsFromApi(api) {
  const byRegion = new Map((api?.regions || []).map((r) => [r.region, r]))
  return REGION_ORDER.map((name) => {
    const r = byRegion.get(name) || {}
    const stationRows = (r.stations || []).map((s) => ({
      station: s.station,
      competency: s.competency ?? null,
      userCount: s.userCount || 0,
      sampleSize: s.sampleSize || 0,
      domainBreakdown: s.domainBreakdown || [],
    }))
    return {
      id: name.charAt(0),
      name,
      nameFull: `${name}ern Region`,
      competency: r.competency ?? null,
      stations: stationRows.map((s) => s.station),
      stationRows,
      gaps: (r.domainGaps || []).map((g) => g.domain),
      domainCount: stationRows.reduce((s, x) => s + x.domainBreakdown.length, 0),
    }
  })
}

export default function RegionalHeatmap() {
  const { competencyRecords, stationRegionMap } = useCourses()
  const { currentUser } = useAuth()
  const backendActive = currentUser?.authSource === 'supabase'

  // DEV demo mode (VITE_DEMO_MODE=true): the heatmap, dispatch panel and station
  // table are read-only surfaces, so even a REAL admin session renders them from
  // the seeded demo dataset. Real backend analytics stay authoritative whenever
  // the demo flag is off.
  const realSource = backendActive && !DEMO_MODE

  const [apiRegional, setApiRegional] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!realSource) return
    let active = true
    setLoading(true)
    analyticsApi
      .getRegional()
      .then((data) => {
        if (active) setApiRegional(data)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[RegionalHeatmap] Failed to load regional analytics:', err.message)
        if (active) setApiRegional({ regions: [], stations: [] })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [realSource])

  // Backend path uses real assessment aggregates; the in-memory demo path keeps
  // deriving live figures from the seeded competency records.
  const regions = useMemo(() => {
    if (realSource) return regionsFromApi(apiRegional)
    return regionalCompetency.map((r) => {
      const regionRecords = competencyRecords.filter((rec) => stationRegionMap[rec.station] === r.region)
      let competency = r.competency
      if (regionRecords.length) {
        competency = Math.round(regionRecords.reduce((s, rec) => s + rec.competency, 0) / regionRecords.length)
      }
      const recordsByDomain = {}
      regionRecords.forEach((rec) => {
        recordsByDomain[rec.domain] = (recordsByDomain[rec.domain] || 0) + rec.competency
      })
      const stationRows = r.stations.map((s) => ({ station: s, competency, sampleSize: regionRecords.length }))
      return {
        id: r.region.charAt(0),
        name: r.region,
        nameFull: `${r.region}ern Region`,
        competency,
        stations: r.stations,
        stationRows,
        gaps: r.gaps,
        domainCount: Object.keys(recordsByDomain).length,
      }
    })
  }, [realSource, apiRegional, competencyRecords, stationRegionMap])

  const defaultRegion = regions[2] || regions[0]
  const [activeId, setActiveId] = useState(null)
  const activeRegion = regions.find((x) => x.id === activeId) || defaultRegion

  const ranked = useMemo(
    () => regions.filter((r) => r.competency != null).sort((a, b) => a.competency - b.competency),
    [regions],
  )
  const lowest = ranked[0] || null
  const allStationRows = regions.flatMap((r) => r.stationRows.map((s) => ({ s, r })))

  if (loading) {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-primary-deep">Regional Competency Heatmap</h2>
        <Card className="p-6 text-sm text-slate-muted">Loading regional capacity data…</Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">Regional Competency Heatmap</h2>
        <p className="text-sm text-slate-muted">
          Workforce scientific competency across regional weather stations, derived from live course completion records.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Map / grid visualization */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <MapIcon size={18} className="text-primary" /> Coverage by Region
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-muted">Legend:</span>
              <span className="h-3 w-3 rounded bg-[#123a5c]" /><span className="text-xs text-slate-muted">≥80</span>
              <span className="h-3 w-3 rounded bg-[#1F5F93]" /><span className="text-xs text-slate-muted">70-79</span>
              <span className="h-3 w-3 rounded bg-[#4E84B7]" /><span className="text-xs text-slate-muted">60-69</span>
              <span className="h-3 w-3 rounded bg-[#7EA8CC]" /><span className="text-xs text-slate-muted">&lt;60</span>
              <span className="h-3 w-3 rounded bg-[#94A3B8]" /><span className="text-xs text-slate-muted">No data</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={`rounded-xl p-4 text-center transition-all ${
                  activeRegion?.id === r.id ? 'ring-2 ring-primary ring-offset-2' : ''
                } ${shadeBg(r.competency)}`}
              >
                <p className="text-3xl font-bold">{r.id}</p>
                <p className="text-xs font-medium uppercase opacity-90">{r.name} Region</p>
                <p className="mt-2 text-sm font-semibold">{pct(r.competency)}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-border-subtle bg-sky-soft p-4">
            <p className="text-sm font-semibold text-primary-deep">
              Key Insight: Where does the organization have capacity gaps?
            </p>
            <p className="mt-1.5 text-sm text-slate-body">
              {lowest ? (
                <>
                  The <b>{lowest.nameFull}</b> shows the lowest workforce competency ({pct(lowest.competency)})
                  {lowest.gaps.length ? <> , with notable gaps in {lowest.gaps.join(' and ')}.</> : <>.</>} Targeted
                  capacity-building is recommended there.
                </>
              ) : (
                <>No assessment results have been recorded yet, so regional competency cannot be ranked. Targeted
                capacity-building will surface here once completed assessments exist.</>
              )}
            </p>
          </div>
        </Card>

        {/* Active region detail */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <TrendingUp size={18} className="text-primary" /> {activeRegion?.nameFull}
          </h3>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-muted">Overall competency</span>
              <span className="font-semibold text-primary">{pct(activeRegion?.competency)}</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar value={activeRegion?.competency ?? 0} color={activeRegion?.competency == null ? 'bg-slate-300' : 'bg-primary'} />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Weather Stations</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeRegion?.stations.length
                ? activeRegion.stations.map((s) => <Badge key={s}>{s}</Badge>)
                : <p className="text-sm text-slate-muted">No stations configured.</p>}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Skill Gaps</p>
            <div className="mt-2 space-y-2">
              {activeRegion?.gaps.map((g) => (
                <div key={g} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-amber-800"><AlertTriangle size={14} /> {g}</span>
                  <Badge tone="amber">Critical</Badge>
                </div>
              ))}
              {activeRegion?.gaps.length === 0 && <p className="text-sm text-slate-muted">No critical gaps detected.</p>}
            </div>
          </div>
        </Card>
      </div>

      {/* Regional Officer Dispatch — full-width so the workflow has room to breathe */}
      <Card className="p-6">
        <OfficerDispatchPanel key={activeRegion?.id} region={activeRegion} regions={regions} backendActive={realSource} />
      </Card>

      {/* Station level table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4">
          <h3 className="font-semibold text-primary-deep">Station Competency Breakdown</h3>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-y border-border-subtle bg-sky-soft text-xs uppercase tracking-wide text-slate-muted">
                <th className="px-6 py-3 font-medium">Weather Station</th>
                <th className="px-4 py-3 font-medium">Region</th>
                <th className="px-4 py-3 font-medium">Competency</th>
                <th className="px-4 py-3 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {allStationRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center">
                    <MapIcon size={22} className="mx-auto text-slate-muted" />
                    <p className="mt-2 text-sm font-medium text-slate-body">No station competency records yet.</p>
                    <p className="mt-0.5 text-xs text-slate-muted">
                      Completed assessments will appear here once competency data is available.
                    </p>
                  </td>
                </tr>
              )}
              {allStationRows.map(({ s, r }) => (
                <tr key={`${r.id}-${s.station}`} className="hover:bg-sky-soft/50">
                  <td className="px-6 py-3 font-medium text-primary-deep">{s.station}</td>
                  <td className="px-4 py-3 text-slate-body">{r.name} Region</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-[#EAF0F6]">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${s.competency ?? 0}%`, backgroundColor: shadeColor(s.competency) }}
                        />
                      </div>
                      <span className="text-xs text-slate-muted">{pct(s.competency)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {s.competency == null
                      ? <Badge tone="slate">No data</Badge>
                      : <Badge tone={s.competency < 70 ? 'amber' : 'green'}>{s.competency < 70 ? 'High Priority' : 'Stable'}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
