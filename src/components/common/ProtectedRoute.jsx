import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * 1. Authentication: is the user logged in?
 * 2. Verification status: has the account been approved?
 * 3. Role: what role and does it have permission for the route?
 *
 * Pending users are allowed into their own role's area so they can explore
 * public content (catalog, course details) and see a limited account section.
 * Operational actions inside those views remain locked until approval.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { currentUser, loading } = useAuth()
  const location = useLocation()

  // Wait for auth + profile load before making any route decision (no UI flash).
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-soft">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-light border-t-secondary" />
      </div>
    )
  }

  // Unauthenticated -> auth page
  if (!currentUser) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  // ADMIN is always strictly protected — never accessible until fully approved.
  if (allowedRoles?.includes('ADMIN')) {
    if (currentUser.role !== 'ADMIN' || currentUser.status !== 'approved') {
      return <Navigate to="/unauthorized" replace />
    }
  }

  // Role not permitted -> unauthorized (trainee hitting /admin etc.)
  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  // Authenticated but pending for a role -> allow limited exploration
  if (currentUser.status !== 'approved') {
    return children
  }

  return children
}
