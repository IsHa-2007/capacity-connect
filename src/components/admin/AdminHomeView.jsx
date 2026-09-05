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

export default function AdminDashboardView() {
  const { pendingUsers } = useAuth()
  const { courses, competencyRecords } = useCourses()
  const pending = pendingUsers.length
  const activeCourses = courses.filter((c) => c.status === 'published').length
  const avgCompetency = competencyRecords.length
    ? Math.round(competencyRecords.reduce((s, r) => s + r.competency, 0) / competencyRecords.length)
    : 0

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

      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={ShieldCheck} label="Pending Approvals" value={pending} tone="amber" />
        <StatCard icon={Users} label="Active Trainees" value="2,400" sub="86% verified" />
        <StatCard icon={UserCheck} label="Verified Trainers" value="78" tone="green" />
        <StatCard icon={Map} label="Regional Coverage" value="36" sub="stations" tone="navy" />
        <StatCard icon={GraduationCap} label="Courses Running" value={activeCourses} />
        <StatCard icon={BarChart3} label="Avg Competency" value={`${avgCompetency}%`} tone="green" />
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
