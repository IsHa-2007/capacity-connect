import { useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Home, Layers, User } from 'lucide-react'
import Navbar from '../components/common/Navbar'
import ProtectedRoute from '../components/common/ProtectedRoute'
import TrainerHomeView from '../components/trainer/TrainerHomeView'
import MyCoursesView from '../components/trainer/MyCoursesView'
import TrainerProfileView from '../components/trainer/TrainerProfileView'
import PublicProfileView from '../components/profile/PublicProfileView'

const navItems = [
  { to: '/trainer', label: 'Home', icon: Home, end: true },
  { to: '/trainer/courses', label: 'My Courses', icon: Layers },
  { to: '/trainer/profile', label: 'Profile', icon: User },
]

export default function TrainerDashboard() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <ProtectedRoute allowedRoles={['TRAINER']}>
      <div className="flex min-h-screen flex-col">
        <Navbar title="CAPACITY CONNECT" onMenu={() => setMobileOpen((v) => !v)} />
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-primary-deep/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 bg-white p-4 shadow-xl">
              <TrainerNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 space-y-1">
              <TrainerNav />
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <Routes>
              <Route index element={<TrainerHomeView />} />
              <Route path="courses" element={<MyCoursesView />} />
              <Route path="courses/:courseId" element={<MyCoursesView />} />
              <Route path="profile" element={<TrainerProfileView />} />
              <Route path="profile/:uid" element={<PublicProfileView backTo="/trainer" />} />
              <Route path="*" element={<Navigate to="/trainer" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

function TrainerNav({ onNavigate }) {
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
