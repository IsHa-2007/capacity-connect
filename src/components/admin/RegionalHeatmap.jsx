import { useState } from 'react'
import { AlertTriangle, Map, TrendingUp } from 'lucide-react'
import { Card, Badge, ProgressBar } from '../common/ui'
import { useCourses } from '../../context/CourseContext'
import { regionalCompetency } from '../../data/mockData'

// Blue shade scale (higher competency = deeper blue)
function shadeColor(competency) {
  if (competency >= 80) return '#123a5c'
  if (competency >= 70) return '#1F5F93'
  if (competency >= 60) return '#4E84B7'
  return '#7EA8CC'
}

function shadeBg(competency) {
  if (competency >= 80) return 'bg-[#123a5c] text-white'
  if (competency >= 70) return 'bg-[#1F5F93] text-white'
  if (competency >= 60) return 'bg-[#4E84B7] text-white'
  return 'bg-[#7EA8CC] text-white'
}

export default function RegionalHeatmap() {
  const { competencyRecords, stationRegionMap } = useCourses()

  // Build live regions from seed metadata + real competency records.
  const regions = regionalCompetency.map((r) => {
    const regionRecords = competencyRecords.filter((rec) => stationRegionMap[rec.station] === r.region)
    let competency = r.competency
    if (regionRecords.length) {
      competency = Math.round(regionRecords.reduce((s, rec) => s + rec.competency, 0) / regionRecords.length)
    }
    const recordsByDomain = {}
    regionRecords.forEach((rec) => {
      recordsByDomain[rec.domain] = (recordsByDomain[rec.domain] || 0) + rec.competency
    })
    return {
      id: r.region.charAt(0),
      name: r.region,
      nameFull: `${r.region}ern Region`,
      competency,
      stations: r.stations,
      gaps: r.gaps,
      domainCount: Object.keys(recordsByDomain).length,
    }
  })

  const [active, setActive] = useState(regions[2])
  const activeRegion = regions.find((x) => x.id === active.id) || active

  const lowest = [...regions].sort((a, b) => a.competency - b.competency)[0]

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
              <Map size={18} className="text-primary" /> Coverage by Region
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-muted">Legend:</span>
              <span className="h-3 w-3 rounded bg-[#123a5c]" /><span className="text-xs text-slate-muted">≥80</span>
              <span className="h-3 w-3 rounded bg-[#1F5F93]" /><span className="text-xs text-slate-muted">70-79</span>
              <span className="h-3 w-3 rounded bg-[#4E84B7]" /><span className="text-xs text-slate-muted">60-69</span>
              <span className="h-3 w-3 rounded bg-[#7EA8CC]" /><span className="text-xs text-slate-muted">&lt;60</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r)}
                className={`rounded-xl p-4 text-center transition-all ${
                  activeRegion.id === r.id ? 'ring-2 ring-primary ring-offset-2' : ''
                } ${shadeBg(r.competency)}`}
              >
                <p className="text-3xl font-bold">{r.id}</p>
                <p className="text-xs font-medium uppercase opacity-90">{r.name} Region</p>
                <p className="mt-2 text-sm font-semibold">{r.competency}%</p>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-border-subtle bg-sky-soft p-4">
            <p className="text-sm font-semibold text-primary-deep">
              Key Insight: Where does the organization have capacity gaps?
            </p>
            <p className="mt-1.5 text-sm text-slate-body">
              The <b>{lowest.nameFull}</b> shows the lowest workforce competency ({lowest.competency}%), with notable
              gaps in {lowest.gaps.join(' and ')}. Targeted capacity-building is recommended there.
            </p>
          </div>
        </Card>

        {/* Active region detail */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <TrendingUp size={18} className="text-primary" /> {activeRegion.nameFull}
          </h3>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-muted">Overall competency</span>
              <span className="font-semibold text-primary">{activeRegion.competency}%</span>
            </div>
            <div className="mt-1.5"><ProgressBar value={activeRegion.competency} color="bg-primary" /></div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Weather Stations</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeRegion.stations.map((s) => <Badge key={s}>{s}</Badge>)}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">Skill Gaps</p>
            <div className="mt-2 space-y-2">
              {activeRegion.gaps.map((g) => (
                <div key={g} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-amber-800"><AlertTriangle size={14} /> {g}</span>
                  <Badge tone="amber">Critical</Badge>
                </div>
              ))}
              {activeRegion.gaps.length === 0 && <p className="text-sm text-slate-muted">No critical gaps detected.</p>}
            </div>
          </div>
        </Card>
      </div>

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
              {regions.flatMap((r) => r.stations.map((s) => ({ s, r }))).map(({ s, r }) => (
                <tr key={s} className="hover:bg-sky-soft/50">
                  <td className="px-6 py-3 font-medium text-primary-deep">{s}</td>
                  <td className="px-4 py-3 text-slate-body">{r.name} Region</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-[#EAF0F6]">
                        <div className="h-2 rounded-full" style={{ width: `${r.competency}%`, backgroundColor: shadeColor(r.competency) }} />
                      </div>
                      <span className="text-xs text-slate-muted">{r.competency}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={r.competency < 70 ? 'amber' : 'green'}>{r.competency < 70 ? 'High Priority' : 'Stable'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
