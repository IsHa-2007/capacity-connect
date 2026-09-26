import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  GitCompareArrows,
  GraduationCap,
  Map,
  ShieldCheck,
  Users,
  UserCheck,
  BarChart3,
} from 'lucide-react'
import { Card, StatCard, Badge } from '../common/ui'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { DEMO_MODE } from '../../utils/demoDataMode'
import * as analyticsApi from '../../services/analyticsApi'
import * as userService from '../../services/userService'

export default function AdminDashboardView() {
  const { pendingUsers, currentUser, allUsers } = useAuth()
  const { courses, competencyRecords } = useCourses()
  const backendActive = currentUser?.authSource === 'supabase'
  // DEV demo mode: the read-only summary figures render from the seeded demo
  // directory; the verification queue below ALWAYS stays real (approvals are
  // writes and must keep hitting the backend).
  const realSource = backendActive && !DEMO_MODE
  const [summary, setSummary] = useState(null)
  const [demoCounts, setDemoCounts] = useState(null)

  // Real (supabase) admins read the authoritative platform summary; the mock
  // path keeps deriving figures from the seeded stores used for demos.
  useEffect(() => {
    if (!realSource) return
    let active = true
    analyticsApi
      .getInsights()
      .then((data) => {
        if (active) setSummary(data?.summary || {})
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[AdminHomeView] Failed to load platform insights:', err.message)
        if (active) setSummary({})
      })
    return () => {
      active = false
    }
  }, [realSource])

  // DEV demo mode: same fields the backend summary reports, derived from the
  // seeded directory (never hardcoded constants). Pending approvals are NOT
  // taken from here — the queue is a real write surface.
  useEffect(() => {
    if (!DEMO_MODE) return
    let active = true
    userService
      .getAllUsers()
      .then((all) => {
        if (!active) return
        const list = Array.isArray(all) ? all : []
        const approved = list.filter((u) => String(u.approvalStatus || '').toUpperCase() === 'APPROVED')
        setDemoCounts({
          approvedTrainees: approved.filter((u) => u.role === 'TRAINEE').length,
          approvedTrainers: approved.filter((u) => u.role === 'TRAINER').length,
          stationCount: new Set(approved.map((u) => u.station).filter(Boolean)).size,
          regionCount: new Set(approved.map((u) => u.region).filter(Boolean)).size,
        })
      })
      .catch(() => {
        if (active) setDemoCounts(null)
      })
    return () => {
      active = false
    }
  }, [])

  const pending = pendingUsers.length
  const activeCourses = courses.filter((c) => c.status === 'published').length
  const avgCompetency = competencyRecords.length
    ? Math.round(competencyRecords.reduce((s, r) => s + r.competency, 0) / competencyRecords.length)
    : null

  // DEV/mock summaries derive figures from the seeded user store (same fields
  // the backend summary reports) — never hardcoded constants.
  const approved = (allUsers || []).filter((u) => (u.status || u.approvalStatus || '').toLowerCase() === 'approved')
  const approvedTrainees = approved.filter((u) => u.role === 'TRAINEE').length
  const approvedTrainers = approved.filter((u) => u.role === 'TRAINER').length
  const approvedStations = new Set(approved.map((u) => u.station).filter(Boolean)).size
  const approvedRegions = new Set(approved.map((u) => u.region).filter(Boolean)).size

  const stat = (key, fallback) => {
    if (realSource) return summary && summary[key] != null ? summary[key] : null
    if (DEMO_MODE) return demoCounts && demoCounts[key] != null ? demoCounts[key] : fallback
    return fallback
  }

  const trainees = stat('approvedTrainees', approvedTrainees)
  const trainers = stat('approvedTrainers', approvedTrainers)
  const stationCount = stat('stationCount', approvedStations)
  const regionCount = stat('regionCount', approvedRegions)
  const runningCourses = stat('publishedCourses', activeCourses)
  const competency = realSource ? (summary?.avgAssessmentPercentage ?? null) : avgCompetency

  return (
    <div className="space-y-8">
      {/* Governance header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary-deep to-primary p-8 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-secondary/40 blur-2xl" />
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <ShieldCheck size={14} /> Authorized Governance Area
          </span>
          <h1 className="mt-4 text-2xl font-semibold">Strategic Workforce Overview</h1>
          <p className="mt-1.5 max-w-xl text-sm text-blue-100">
            Monitor functional readiness, verification, regional capability, and trainer allocation across IMD.
          </p>
        </div>
      </div>

      {/* Summary metrics — every figure comes from the authoritative backend
          (or is left blank) instead of a hardcoded placeholder. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={ShieldCheck} label="Pending Approvals" value={realSource ? (summary?.pendingApprovals ?? '—') : pending} tone="amber" />
        <StatCard icon={Users} label="Active Trainees" value={trainees ?? '—'} />
        <StatCard icon={UserCheck} label="Verified Trainers" value={trainers ?? '—'} tone="green" />
        <StatCard icon={Map} label="Regional Coverage" value={stationCount ?? '—'} sub={regionCount ? `${regionCount} regions` : 'stations'} tone="navy" />
        <StatCard icon={GraduationCap} label="Courses Running" value={runningCourses ?? 0} />
        <StatCard icon={BarChart3} label="Avg Competency" value={competency == null ? '—' : `${competency}%`} tone="green" />
      </div>

      {/* Quick actions + verification */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Quick action to verification */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <ShieldCheck size={18} className="text-primary" /> Verification Queue
            </h3>
            <Badge tone="amber">{pending} pending</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-body">
            Review and approve new Trainee and Trainer accounts using official Government/
            Department ID and Regional Weather Station credentials.
          </p>
          <Link to="/admin/verification" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Open Queue <ArrowRight size={16} />
          </Link>
        </Card>

        {/* Quick action to matcher */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <GitCompareArrows size={18} className="text-primary" /> Trainer Matching
          </h3>
          <p className="mt-2 text-sm text-slate-body">
            Use the weighted matching engine to recommend the right scientific expert for each course.
          </p>
          <Link to="/admin/matcher" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-white hover:bg-secondary/90">
            Open Matcher <ArrowRight size={16} />
          </Link>
        </Card>

        {/* Quick action to broadcast */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <BellRing size={18} className="text-primary" /> Broadcast Center
          </h3>
          <p className="mt-2 text-sm text-slate-body">
            Send training announcements, policy changes, and operational notices to targeted groups.
          </p>
          <Link to="/admin/broadcast" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-sky-light px-4 py-2 text-sm font-medium text-primary hover:bg-blue-100">
            Open Broadcast <ArrowRight size={16} />
          </Link>
        </Card>
      </div>

      {/* Recent registrations */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h3 className="font-semibold text-primary-deep">Recent Pending Registrations</h3>
          <Link to="/admin/verification" className="text-sm font-medium text-primary hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-y border-border-subtle bg-sky-soft text-xs uppercase tracking-wide text-slate-muted">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Station</th>
                <th className="px-4 py-3 font-medium">Department ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {pendingUsers.map((v) => (
                <tr key={v.id} className="hover:bg-sky-soft/50">
                  <td className="px-6 py-3 font-medium text-primary-deep">{v.name}</td>
                  <td className="px-4 py-3"><Badge tone={v.role === 'TRAINER' ? 'navy' : 'blue'}>{v.role}</Badge></td>
                  <td className="px-4 py-3 text-slate-body">{v.station}</td>
                  <td className="px-4 py-3 text-slate-muted">{v.empId}</td>
                  <td className="px-4 py-3"><Badge tone="amber">Pending</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
