import { useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  BellRing,
  GitCompareArrows,
  LayoutDashboard,
  Map,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import Navbar from '../components/common/Navbar'
import ProtectedRoute from '../components/common/ProtectedRoute'
import AdminDashboardView from '../components/admin/AdminHomeView'
import VerificationQueue from '../components/admin/VerificationQueue'
import CompetencyMatcher from '../components/admin/CompetencyMatcher'
import RegionalHeatmap from '../components/admin/RegionalHeatmap'
import BroadcastCenter from '../components/admin/BroadcastCenter'
import AdminUserManagement from '../components/admin/AdminUserManagement'
import AdminProfileView from '../components/admin/AdminProfileView'

const navItems = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/verification', label: 'Verification Queue', icon: ShieldCheck },
  { to: '/admin/users', label: 'User Management', icon: UsersRound },
  { to: '/admin/matcher', label: 'Trainer Matching', icon: GitCompareArrows },
  { to: '/admin/regions', label: 'Regional Heatmap', icon: Map },
  { to: '/admin/broadcast', label: 'Broadcast Center', icon: BellRing },
]

export default function AdminDashboard() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <ProtectedRoute allowedRoles={['ADMIN']}>
      <div className="flex min-h-screen flex-col">
        <Navbar title="CAPACITY CONNECT" onMenu={() => setMobileOpen((v) => !v)} />
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-primary-deep/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 bg-white p-4 shadow-xl">
              <AdminNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-24 space-y-1">
              <div className="mb-3 rounded-xl border border-border-soft bg-primary-deep p-3 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Governance</p>
                <p className="mt-0.5 text-sm font-medium">Admin Console</p>
              </div>
              <AdminNav />
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <Routes>
              <Route index element={<AdminDashboardView />} />
              <Route path="verification" element={<VerificationQueue />} />
              <Route path="users" element={<AdminUserManagement />} />
              <Route path="profile/:uid" element={<AdminProfileView />} />
              <Route path="matcher" element={<CompetencyMatcher />} />
              <Route path="regions" element={<RegionalHeatmap />} />
              <Route path="broadcast" element={<BroadcastCenter />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

function AdminNav({ onNavigate }) {
  return (
    <nav className="space-y-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-[0_2px_8px_rgba(31,95,147,0.25)]'
                : 'text-slate-body hover:bg-sky-light hover:text-primary'
            }`
          }
        >
          <item.icon size={18} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
