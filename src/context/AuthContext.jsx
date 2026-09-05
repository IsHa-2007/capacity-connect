import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { isFirebaseConfigured, getFirebase } from '../firebase/config'
import { users as seedUsers } from '../data/mockData'
import {
  createUserProfile,
  getUserProfile,
  getAllUsers,
  updateUserProfile,
  approveUser as approveUserService,
  rejectUser as rejectUserService,
  setUserRole as setUserRoleService,
} from '../services/userService'

const AuthContext = createContext(null)

// ---------------------------------------------------------------------------
// DEV-ONLY mock credential store.
// ---------------------------------------------------------------------------
// Real production accounts come from Firebase Auth. This module-level store lets
// the platform run during development when Firebase credentials are absent. It is
// isolated, does NOT use localStorage, and is never the production source of truth.
const MOCK_CRED = new Map(
  seedUsers.map((u) => [u.email.toLowerCase(), { password: u.password, uid: u.id }]),
)

function normalizeProfile(p) {
  if (!p) return null
  const status = String(p.approvalStatus || '').toLowerCase()
  return {
    ...p,
    id: p.uid || p.id,
    uid: p.uid || p.id,
    name: p.fullName || p.name,
    role: p.role,
    status: status,
    approvalStatus: (p.approvalStatus || '').toUpperCase(),
    email: p.email,
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [version, setVersion] = useState(0)

  const isAdmin = currentUser?.role === 'ADMIN' && currentUser?.status === 'approved'

  // Load all users (admin verification queue + history). Only fetched for admins
  // to avoid unnecessary loads, but kept generic so it works for the mock path too.
  const loadUsers = useCallback(async () => {
    try {
      const all = await getAllUsers()
      setUsers(all.map(normalizeProfile))
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    if (isAdmin) loadUsers()
  }, [isAdmin, loadUsers, version])

  // Load a profile into context state (used by login and refresh).
  const applyProfile = useCallback((profile) => {
    setUserProfile(profile)
    setCurrentUser(normalizeProfile(profile))
    return normalizeProfile(profile)
  }, [])

  // -------------------------------------------------------------------------
  // FIREBASE AUTH LISTENER
  // -------------------------------------------------------------------------
  const resolveProfile = useCallback(
    async (fbUser) => {
      setFirebaseUser(fbUser)
      if (!fbUser) {
        setCurrentUser(null)
        setUserProfile(null)
        setLoading(false)
        return
      }
      try {
        const profile = await getUserProfile(fbUser.uid)
        if (!profile) {
          console.error(
            `[Auth] Firebase Auth user ${fbUser.uid} (${fbUser.email}) has no Firestore profile document. ` +
            `Run scripts/provision-admin.mjs or create the users/${fbUser.uid} document in Firestore.`
          )
          await signOut(getFirebase().auth)
          setCurrentUser(null)
          setUserProfile(null)
        } else {
          applyProfile(profile)
        }
      } catch (err) {
        console.error('[Auth] Failed to load user profile:', err)
        setCurrentUser(null)
        setUserProfile(null)
      } finally {
        setLoading(false)
      }
    },
    [applyProfile],
  )

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false)
      return
    }
    const auth = getFirebase().auth
    const unsub = onAuthStateChanged(auth, (fbUser) => resolveProfile(fbUser))
    return unsub
  }, [resolveProfile])

  // -------------------------------------------------------------------------
  // LOGIN / REGISTER / LOGOUT
  // -------------------------------------------------------------------------
  const login = async ({ email, password }) => {
    let uid
    if (isFirebaseConfigured()) {
      try {
        const userCred = await signInWithEmailAndPassword(getFirebase().auth, email, password)
        uid = userCred.user.uid
      } catch (e) {
        return { ok: false, error: friendlyAuthError(e.code) }
      }
    } else {
      const cred = MOCK_CRED.get(email.trim().toLowerCase())
      if (!cred || cred.password !== password)
        return { ok: false, error: 'Invalid email or password.' }
      uid = cred.uid
    }
    const profile = await getUserProfile(uid)
    if (!profile) {
      console.warn('[Auth] Login succeeded but no Firestore profile found for uid:', uid)
      const msg = isFirebaseConfigured()
        ? 'Your account is not set up in the platform database. Please contact your administrator.'
        : 'Invalid email or password.'
      return { ok: false, error: msg }
    }
    const user = applyProfile(profile)
    return { ok: true, user }
  }

  const register = async (data) => {
    const email = data.email.trim().toLowerCase()
    if (isFirebaseConfigured()) {
      let newUser = null
      try {
        const auth = getFirebase().auth
        const userCred = await createUserWithEmailAndPassword(auth, email, data.password)
        newUser = userCred.user
        if (data.name) await updateProfile(newUser, { displayName: data.name })
      } catch (e) {
        return { ok: false, error: friendlyAuthError(e.code) }
      }
      try {
        const profile = await createUserProfile({
          uid: newUser.uid,
          fullName: data.name,
          email,
          role: data.role, // 'TRAINEE' | 'TRAINER' — never ADMIN via public form
          station: data.station,
          department: data.department,
          empId: data.empId,
          title: data.title,
          expertise: data.role === 'TRAINER' ? (data.expertise ? [data.expertise] : []) : [],
          experience: data.experience,
        })
        applyProfile(profile)
        return { ok: true, user: normalizeProfile(profile) }
      } catch (profileErr) {
        console.error('[Auth] Firestore profile creation failed:', profileErr)
        console.error('[Auth] Firebase Auth UID:', newUser.uid, '— cleaning up orphaned Auth account')
        try { await newUser.delete() } catch { /* best-effort cleanup */ }
        return { ok: false, error: 'Account setup failed. Your registration has been rolled back. Please try again.' }
      }
    }
    const role = data.role === 'ADMIN' ? 'TRAINEE' : data.role || 'TRAINEE'
    if (MOCK_CRED.has(email)) return { ok: false, error: 'An account with this email already exists.' }
    const uid = `u${Date.now()}`
    MOCK_CRED.set(email, { password: data.password, uid })
    const profile = await createUserProfile({
      uid,
      fullName: data.name,
      email,
      role,
      station: data.station,
      department: data.department,
      empId: data.empId,
      title: data.title,
      expertise: role === 'TRAINER' ? (data.expertise ? [data.expertise] : []) : [],
      experience: data.experience,
    })
    // A freshly registered account stays PENDING and requires a separate login
    // once approved. Do not auto-authenticate the mock user here.
    setVersion((v) => v + 1)
    return { ok: true, user: normalizeProfile(profile) }
  }

  const logout = async () => {
    if (isFirebaseConfigured()) {
      try {
        await signOut(getFirebase().auth)
      } catch {
        /* ignore */
      }
    }
    setCurrentUser(null)
    setUserProfile(null)
    setFirebaseUser(null)
    setUsers([])
  }

  const refreshUserProfile = () => {
    if (!currentUser?.uid) return Promise.resolve(null)
    return getUserProfile(currentUser.uid).then(applyProfile)
  }

  // Load any user's public profile by uid (used by public profile viewers).
  const getProfileByUid = useCallback(async (uid) => {
    if (!uid) return null
    const profile = await getUserProfile(uid)
    return normalizeProfile(profile)
  }, [])

  // Persist professional profile / certification edits for the logged-in user
  // and immediately refresh context state so the UI reflects the changes.
  const saveProfile = async (patch) => {
    if (!currentUser?.uid) return { ok: false, error: 'Not signed in.' }
    const updated = await updateUserProfile(currentUser.uid, patch)
    if (updated) applyProfile(updated)
    return { ok: true, user: normalizeProfile(updated) }
  }

  // -------------------------------------------------------------------------
  // ADMIN APPROVAL
  // -------------------------------------------------------------------------
  const approveUser = async (uid) => {
    const profile = await approveUserService(uid)
    if (profile) {
      if (uid === currentUser?.uid) applyProfile(profile)
      setVersion((v) => v + 1)
    }
    return profile
  }

  const rejectUser = async (uid) => {
    const profile = await rejectUserService(uid)
    if (profile) {
      if (uid === currentUser?.uid) applyProfile(profile)
      setVersion((v) => v + 1)
    }
    return profile
  }

  // Change a user's role (ADMIN only; the UI guards the caller, the store relies
  // on Firestore rules in production and UI checks in dev).
  const changeUserRole = async (uid, role) => {
    if (!isAdmin) return { ok: false, error: 'Only admins can change roles.' }
    const profile = await setUserRoleService(uid, role)
    if (profile) {
      if (uid === currentUser?.uid) applyProfile(profile)
      setVersion((v) => v + 1)
    }
    return profile
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
      firebaseUser,
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
      getProfileByUid,
      allUsers: users,
      pendingUsers,
      approveUser,
      rejectUser,
      changeUserRole,
      canAccessRoute,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, firebaseUser, userProfile, loading, users, version],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

function friendlyAuthError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/network-request-failed':
      return 'Network error. Please try again.'
    default:
      return 'Unable to complete this request. Please try again.'
  }
}
