import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CourseProvider } from './context/CourseContext'
import { TrainerProvider } from './context/TrainerContext'
import { BroadcastProvider } from './context/BroadcastContext'
import { ConnectivityProvider } from './offline/ConnectivityProvider'
import { OfflineStatus } from './offline/OfflineStatus'
import LandingDashboard from './pages/LandingDashboard'
import AuthPage from './pages/AuthPage'
import PendingApprovalPage from './pages/PendingApprovalPage'
import TraineeApp from './pages/TraineeApp'
import TrainerDashboard from './pages/TrainerDashboard'
import AdminDashboard from './pages/AdminDashboard'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-soft">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-light border-t-secondary" />
    </div>
  )
}

function RoleHome() {
  const { currentUser, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!currentUser) return <Navigate to="/" replace />
  // PENDING users enter their normal role-based experience (restricted actions are
  // locked in-UI). Only a completely unauthenticated visitor is bounced.
  if (currentUser.role === 'ADMIN' && currentUser.status !== 'approved')
    return <PendingApprovalPage />
  if (currentUser.role === 'ADMIN') return <Navigate to="/admin" replace />
  if (currentUser.role === 'TRAINER') return <Navigate to="/trainer" replace />
  return <Navigate to="/trainee" replace />
}

function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-soft p-4">
      <div className="w-full max-w-md rounded-2xl border border-border-soft bg-white p-8 text-center shadow-[0_8px_30px_rgba(31,95,147,0.08)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldX size={32} />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-primary-deep">Unauthorized Access</h2>
        <p className="mt-2 text-sm text-slate-body">
          Your account does not currently have authorization to access this area. Access is
          restricted to roles with the appropriate permissions.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Return to Home
        </a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ConnectivityProvider>
      <AuthProvider>
        <CourseProvider>
          <TrainerProvider>
            <BroadcastProvider>
              <BrowserRouter>
                <OfflineStatus />
                <Routes>
                  <Route path="/" element={<LandingDashboard />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/home" element={<RoleHome />} />
                  <Route path="/unauthorized" element={<Unauthorized />} />
                  <Route path="/trainee/*" element={<TraineeApp />} />
                  <Route path="/trainer/*" element={<TrainerDashboard />} />
                  <Route path="/admin/*" element={<AdminDashboard />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </BroadcastProvider>
          </TrainerProvider>
        </CourseProvider>
      </AuthProvider>
    </ConnectivityProvider>
  )
}
