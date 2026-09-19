import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react'
import { users as seedUsers } from '../data/mockData'
import * as authApi from '../services/authService'
import * as userApi from '../services/userApi'
import { cloudPhotoUrl } from '../services/userApi'
import { getAccessToken, setAccessToken, isApiHttpError } from '../services/api'
import * as userService from '../services/userService'

const AuthContext = createContext(null)

// ---------------------------------------------------------------------------
// DEV-ONLY mock credential store.
// ---------------------------------------------------------------------------
// Real accounts are created in Supabase Auth through the backend (public.users
// plus an Auth identity). This module-level store lets the four seed accounts
// sign in during local development when the backend is unreachable. It is
// isolated, uses no localStorage, is never the production source of truth, and
// is compiled out of production builds (DEV_MOCK_ENABLED is false then).
const MOCK_CRED = new Map(
  seedUsers.map((u) => [u.email.toLowerCase(), { password: u.password, uid: u.id }]),
)

const DEV_MOCK_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK_AUTH !== 'false'

// Authoritative identity fields (role / approvalStatus / email) for real users
// come from public.users through the backend. Seed/profile display fields come
// from the in-memory seed when the backend is unreachable in dev.
function seedProfile(seed) {
  return {
    uid: seed.id,
    id: seed.id,
    fullName: seed.name,
    name: seed.name,
    email: seed.email,
    role: seed.role,
    approvalStatus: String(seed.status || '').toUpperCase(),
    station: seed.station,
    region: userService.regionFor(seed.station),
    organization: seed.organization || 'India Meteorological Department',
    department: seed.department || '',
    empId: seed.empId || '',
    title: seed.title || '',
    expertise: seed.expertise || [],
    yearsOfExperience: seed.yearsOfExperience || seed.experience || '',
    authSource: 'mock',
  }
}

// Single source for the shared photoURL/avatar behaviour: an absolute photoURL
// wins; otherwise a backend photoPublicId (Cloudinary) is turned into its
// delivery URL via the VITE_CLOUDINARY_CLOUD_NAME env. Initials fallback stays
// in the Avatar component — no second avatar system.
function photoUrlFor(p) {
  if (p?.photoURL) return p.photoURL
  return cloudPhotoUrl(p?.photoPublicId)
}

// Normalises BOTH backend (public.users) and mock seed profiles into the
// shape the rest of the app consumes (id+uid, name+fullName, status+approvalStatus).
function normalizeProfile(p) {
  if (!p) return null
  const id = p.uid || p.id
  const status = String(p.approvalStatus || p.approval_status || '').toLowerCase()
  return {
    ...p,
    id,
    uid: id,
    name: p.fullName || p.name,
    fullName: p.fullName || p.name,
    role: p.role,
    status,
    approvalStatus: String(p.approvalStatus || p.approval_status || '').toUpperCase(),
    email: p.email,
    organization: p.organization || 'India Meteorological Department',
    photoURL: photoUrlFor(p),
  }
}

function friendlyAuthError(err) {
  const code = String(err?.code || '')
  if (code === 'EMAIL_IN_USE') return 'An account with this email already exists.'
  if (code === 'INVALID_CREDENTIALS') return 'Incorrect email or password.'
  if (code === 'UNAUTHENTICATED') return 'Your session has expired. Please sign in again.'
  if (code === 'APPROVAL_REQUIRED') return 'Your account has not been approved yet.'
  if (code === 'ROLE_LOCKED') return err.message || 'This operation is not allowed.'
  if (code === 'RATE_LIMITED' || err?.status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }
  if (code.startsWith('PROFILE_') || code === 'USER_NOT_FOUND') return err.message || 'Your profile could not be loaded.'
  if (code === 'VALIDATION_ERROR') {
    // Surface the exact offending field(s) the backend rejected. `details` only
    // contains Zod field paths + messages — never secrets or request values.
    const fields = Array.isArray(err?.details)
      ? [...new Set(err.details.map((d) => d?.path).filter(Boolean))]
      : []
    const base = err?.message || 'Please check the information you entered.'
    return fields.length ? `${base} Check: ${fields.join(', ')}.` : base
  }
  return err?.message || 'Unable to complete this request. Please try again.'
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [version, setVersion] = useState(0)

  const isAdmin = currentUser?.role === 'ADMIN' && currentUser?.status === 'approved'

  // Load all users (admin verification queue + history). Real (supabase) admins
  // read the authoritative backend directory; the dev mock path keeps using the
  // in-memory mock service so the demo still works offline.
  const loadUsers = useCallback(async () => {
    try {
      const fromBackend = currentUser?.authSource === 'supabase'
      const all = fromBackend ? await userApi.listUsers() : await userService.getAllUsers()
      const rows = fromBackend ? all?.users || [] : all
      setUsers((rows || []).map(normalizeProfile))
    } catch {
      setUsers([])
    }
  }, [currentUser])

  useEffect(() => {
    if (isAdmin) loadUsers()
  }, [isAdmin, loadUsers, version])

  // Load a profile into context state (used by login, me and refresh).
  const applyProfile = useCallback((profile) => {
    const normalized = normalizeProfile(profile)
    setUserProfile(profile)
    setCurrentUser(normalized)
    return normalized
  }, [])

  const clearSession = useCallback(() => {
    setCurrentUser(null)
    setUserProfile(null)
    setUsers([])
  }, [])

  // -------------------------------------------------------------------------
  // SESSION RESTORE — a stored access token is validated through /auth/me.
  // -------------------------------------------------------------------------
  const restoreSession = useCallback(async () => {
    setLoading(true)
    const token = getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const data = await authApi.getCurrentUser()
      const profile = data?.profile
      if (!profile) {
        console.warn('[Auth] Session token is valid but no public.users profile exists. Logging out.')
        clearAccessToken()
        clearSession()
        return
      }
      if (String(profile.approvalStatus).toUpperCase() === 'REJECTED') {
        clearAccessToken()
        clearSession()
        return
      }
      applyProfile({ ...profile, authSource: 'supabase' })
    } catch (err) {
      // Invalid/expired token -> clear it. Non-auth failures keep the token so a
      // later refresh can retry against the backend.
      if (isApiHttpError(err)) clearAccessToken()
      clearSession()
    } finally {
      setLoading(false)
    }
  }, [applyProfile, clearSession])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // -------------------------------------------------------------------------
  // LOGIN / REGISTER / LOGOUT
  // -------------------------------------------------------------------------
  const login = async ({ email, password }) => {
    let result
    try {
      result = await authApi.login({ email, password })
    } catch (err) {
      // Only fall back to the dev seed store when the API is unreachable
      // (transport failure, not an HTTP 4xx/5xx answer).
      if (!isApiHttpError(err)) {
        if (DEV_MOCK_ENABLED) {
          const cred = MOCK_CRED.get(String(email).trim().toLowerCase())
          if (!cred || cred.password !== password) {
            return { ok: false, error: 'Incorrect email or password.' }
          }
          const seed = seedUsers.find((u) => u.id === cred.uid)
          if (seed) {
            const user = applyProfile(seedProfile(seed))
            return { ok: true, user }
          }
          return { ok: false, error: 'Your account is not set up in the platform database. Please contact your administrator.' }
        }
        return { ok: false, error: 'Unable to reach the login service. Is the backend running?' }
      }
      return { ok: false, error: friendlyAuthError(err) }
    }

    const profile = result?.profile
    if (!profile) {
      clearAccessToken()
      return {
        ok: false,
        error: 'Your account is not set up in the platform database. Please contact your administrator.',
      }
    }
    if (String(profile.approvalStatus).toUpperCase() === 'REJECTED') {
      clearAccessToken()
      return { ok: false, error: 'Your account has been rejected by an administrator. Contact support for help.' }
    }

    if (result.accessToken) setAccessToken(result.accessToken)
    const user = applyProfile({ ...profile, authSource: 'supabase' })
    return { ok: true, user }
  }

  // Public registration requests TRAINEE or TRAINER (validated server-side to
  // those two values only). ADMIN can never be requested; both roles start as
  // PENDING and are verified by an administrator.
  const register = async (data) => {
    const email = String(data.email || '').trim().toLowerCase()
    const requestedRole = data.role === 'TRAINER' ? 'TRAINER' : 'TRAINEE'
    try {
      const result = await authApi.register({
        fullName: data.fullName || data.name,
        email,
        password: data.password,
        station: data.station,
        department: data.department,
        empId: data.empId,
        title: data.title,
        expertise: data.expertise,
        experience: data.experience,
        role: requestedRole,
        professionalSummary: data.professionalSummary,
        specializations: data.specializations,
        skills: data.skills,
        qualifications: data.qualifications,
        trainingInterests: data.trainingInterests,
        achievements: data.achievements,
      })
      return { ok: true, user: result?.user ? normalizeProfile({ ...result.user, authSource: 'supabase' }) : null }
    } catch (err) {
      if (!isApiHttpError(err) && DEV_MOCK_ENABLED) {
        if (MOCK_CRED.has(email)) return { ok: false, error: 'An account with this email already exists.' }
        const uid = `u${Date.now()}`
        MOCK_CRED.set(email, { password: data.password, uid })
        try {
          await userService.createUserProfile({
            uid,
            fullName: data.name,
            email,
            role: requestedRole,
            station: data.station,
            department: data.department,
            empId: data.empId,
            title: data.title,
            expertise: data.expertise ? [data.expertise] : [],
            experience: data.experience,
          })
        } catch {
          return { ok: false, error: 'Account setup failed. Please try again.' }
        }
        setVersion((v) => v + 1)
        return { ok: true, user: null }
      }
      return { ok: false, error: friendlyAuthError(err) }
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      /* ignore */
    }
    clearSession()
  }

  const refreshUserProfile = () => {
    if (!currentUser?.uid) return Promise.resolve(null)
    if (currentUser?.authSource === 'supabase') {
      return authApi
        .getCurrentUser()
        .then((data) => (data?.profile ? applyProfile({ ...data.profile, authSource: 'supabase' }) : null))
        .catch(() => null)
    }
    return userService.getUserProfile(currentUser.uid).then((p) => (p ? applyProfile(p) : null))
  }

  // Load any user's profile by uid. Real users read the backend (the server
  // applies its RBAC projection: full for ADMIN, public for APPROVED peers);
  // dev mock users read the in-memory directory.
  const getProfileByUid = useCallback(async (uid) => {
    if (!uid) return null
    try {
      if (currentUser?.authSource === 'supabase') {
        const data = await userApi.getUser(uid)
        return normalizeProfile(data?.user || null)
      }
      const profile = await userService.getUserProfile(uid)
      return normalizeProfile(profile)
    } catch {
      return null
    }
  }, [currentUser])

  // Persist professional profile / photo edits for the logged-in user and
  // immediately refresh context state so the UI reflects the changes.
  // REAL Supabase users are served by public.users through the backend (PATCH
  // /api/users/me); the backend whitelists every editable field and derives
  // region + profile_completion via the Module 5 triggers.
  const saveProfile = async (patch) => {
    if (!currentUser?.uid) return { ok: false, error: 'Not signed in.' }
    try {
      if (currentUser?.authSource === 'supabase') {
        const data = await userApi.updateMe(patch)
        const updated = data?.profile
        if (updated) applyProfile({ ...updated, authSource: 'supabase' })
        return { ok: true, user: updated ? normalizeProfile({ ...updated, authSource: 'supabase' }) : null }
      }
      const updated = await userService.updateUserProfile(currentUser.uid, patch)
      if (updated) applyProfile(updated)
      return { ok: true, user: normalizeProfile(updated) }
    } catch (err) {
      return { ok: false, error: friendlyAuthError(err) }
    }
  }

  // Profile-photo upload: REAL users go Cloudinary -> PATCH /api/users/me (the
  // backend records the reference in public.users); dev mock users keep the
  // existing in-memory object-URL behaviour through userService.
  const updateProfilePhoto = async (file) => {
    if (!currentUser?.uid) return null
    try {
      if (currentUser?.authSource === 'supabase') {
        const updated = await userApi.uploadProfilePhoto(file)
        if (updated) applyProfile({ ...updated, authSource: 'supabase' })
        return updated ? normalizeProfile({ ...updated, authSource: 'supabase' }) : null
      }
      const updated = await userService.uploadProfilePhoto(currentUser.uid, file)
      if (updated) applyProfile(updated)
      return updated ? normalizeProfile(updated) : null
    } catch {
      return null
    }
  }

  // -------------------------------------------------------------------------
  // ADMIN APPROVAL — real admins mutate public.users via the backend; the dev
  // mock path continues through the in-memory mock service offline.
  // -------------------------------------------------------------------------
  const approveUser = async (uid) => {
    try {
      const profile =
        currentUser?.authSource === 'supabase'
          ? (await userApi.changeApprovalStatus(uid, 'APPROVED'))?.user
          : await userService.approveUser(uid)
      if (profile) setVersion((v) => v + 1)
      return profile
    } catch {
      return null
    }
  }

  const rejectUser = async (uid) => {
    try {
      const profile =
        currentUser?.authSource === 'supabase'
          ? (await userApi.changeApprovalStatus(uid, 'REJECTED'))?.user
          : await userService.rejectUser(uid)
      if (profile) setVersion((v) => v + 1)
      return profile
    } catch {
      return null
    }
  }

  // Change a user's role (ADMIN only). The backend additionally guards the last
  // APPROVED administrator so the platform's governance account cannot lock
  // itself out.
  const changeUserRole = async (uid, role) => {
    if (!isAdmin) return { ok: false, error: 'Only admins can change roles.' }
    try {
      const profile =
        currentUser?.authSource === 'supabase'
          ? (await userApi.changeUserRole(uid, role))?.user
          : await userService.setUserRole(uid, role)
      if (profile) setVersion((v) => v + 1)
      return { ok: true, user: profile ? normalizeProfile(profile) : null }
    } catch (err) {
      return { ok: false, error: friendlyAuthError(err) }
    }
  }

  const pendingUsers = useMemo(() => {
    return users.filter((u) => u.status === 'pending')
  }, [users])

  const canAccessRoute = (allowedRoles) => {
    if (!currentUser || currentUser.status !== 'approved') return false
    return allowedRoles.includes(currentUser.role)
  }

  const value = useMemo(
    () => ({
      currentUser,
      userProfile,
      uid: currentUser?.uid || null,
      role: currentUser?.role || null,
      approvalStatus: currentUser?.approvalStatus || null,
      isApproved: currentUser?.status === 'approved',
      isPending: currentUser?.status === 'pending',
      loading,
      login,
      register,
      logout,
      refreshUserProfile,
      updateProfile: saveProfile,
      updateProfilePhoto,
      getProfileByUid,
      allUsers: users,
      pendingUsers,
      approveUser,
      rejectUser,
      changeUserRole,
      canAccessRoute,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, userProfile, loading, users, version],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)