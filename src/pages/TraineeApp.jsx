import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { Award, BookOpen, GaugeCircle, Home, User } from 'lucide-react'
import Navbar from '../components/common/Navbar'
import HomeView from '../components/trainee/HomeView'
import CourseCatalogView from '../components/trainee/CourseCatalogView'
import CourseWorkspace from '../components/trainee/CourseWorkspace'
import ProgressView from '../components/trainee/ProgressView'
import ProfileView from '../components/trainee/ProfileView'
import PublicProfileView from '../components/profile/PublicProfileView'
import ProtectedRoute from '../components/common/ProtectedRoute'

const navItems = [
  { to: '/trainee', label: 'Home', icon: Home, end: true },
  { to: '/trainee/workspace', label: 'Course Workspace', icon: BookOpen },
  { to: '/trainee/progress', label: 'Progress', icon: GaugeCircle },
  { to: '/trainee/profile', label: 'Profile', icon: User },
]

export default function TraineeApp() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <ProtectedRoute allowedRoles={['TRAINEE']}>
      <div className="flex min-h-screen flex-col">
        <Navbar title="CAPACITY CONNECT" onMenu={() => setMobileOpen((v) => !v)} />

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-primary-deep/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 bg-white p-4 shadow-xl">
              <TraineeNavItems onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
          {/* Desktop sidebar */}
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 space-y-1">
              <TraineeNavItems />
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <Routes>
              <Route index element={<HomeView />} />
              <Route path="catalog" element={<CourseCatalogView />} />
              <Route path="workspace" element={<CourseWorkspace />} />
              <Route path="workspace/:courseId" element={<CourseWorkspace />} />
              <Route path="progress" element={<ProgressView />} />
              <Route path="profile" element={<ProfileView />} />
              <Route path="profile/:uid" element={<PublicProfileView backTo="/trainee" />} />
            </Routes>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

function TraineeNavItems({ onNavigate }) {
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
          {item.label === 'Course Workspace' && <span className="ml-auto text-xs opacity-70"><Award size={14} /></span>}
        </NavLink>
      ))}
    </nav>
  )
}
