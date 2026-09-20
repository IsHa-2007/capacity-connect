import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  User,
  Users,
  Megaphone,
  BookOpen,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBroadcasts } from '../../context/BroadcastContext'
import { useCourses } from '../../context/CourseContext'
import { getSearchableUsers } from '../../services/userService'
import * as notificationApi from '../../services/notificationApi'
import { useOfflineWriteGuard } from '../../offline/useConnectivity'
import { Avatar } from './ui'

const roleLabel = {
  TRAINEE: 'Trainee',
  TRAINER: 'Trainer',
  ADMIN: 'Admin',
}

export default function Navbar({ title = 'CAPACITY CONNECT', onMenu }) {
  const { currentUser, logout } = useAuth()
  const { broadcasts } = useBroadcasts()
  const { courseCatalog, getEnrollment } = useCourses()
  const navigate = useNavigate()
  const guardWrite = useOfflineWriteGuard()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState([])
  const [results, setResults] = useState(null)
  const searchRef = useRef(null)

  const role = currentUser?.role
  const backendActive = currentUser?.authSource === 'supabase'
  const myBroadcasts = broadcasts.filter(
    (b) =>
      b.published &&
      (role === 'TRAINEE'
        ? b.audienceKey === 'all-trainees' || b.audienceKey === 'all'
        : role === 'TRAINER'
          ? b.audienceKey === 'all-trainers' || b.audienceKey === 'all'
          : b.audienceKey != null),
  )

  // Backend-generated notifications (broadcast fan-out + certificate issuance).
  // Mock sessions keep deriving their feed from the seeded broadcasts; real
  // (supabase) sessions read + mutate the authoritative notification store.
  const [backendNotifs, setBackendNotifs] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!backendActive) return
    let active = true
    Promise.all([notificationApi.listNotifications(), notificationApi.getUnreadCount()])
      .then(([list, count]) => {
        if (!active) return
        setBackendNotifs(list)
        setUnreadCount(count)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[Navbar] Failed to load notifications:', err.message)
      })
    return () => {
      active = false
    }
  }, [backendActive])

  const mockNotifs = myBroadcasts.slice(0, 5).map((b) => ({ ...b, isRead: false }))
  const displayNotifs = backendActive ? backendNotifs : mockNotifs
  const badgeCount = backendActive ? unreadCount : myBroadcasts.length

  const markAllRead = async () => {
    if (!backendActive) return
    if (!guardWrite()) return
    try {
      await notificationApi.markAllNotificationsRead()
      setBackendNotifs((list) => list.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Navbar] Failed to mark notifications read:', err.message)
    }
  }

  const readNotification = async (n) => {
    if (!backendActive || n.isRead) return
    if (!guardWrite()) return
    try {
      await notificationApi.markNotificationRead(n.id)
      setBackendNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Navbar] Failed to mark notification read:', err.message)
    }
  }

  // Admins have no '/admin/profile' route (AdminProfileView is reached via
  // /admin/profile/:uid from the user-management screens); the Admin Console
  // overview is the landed page for the profile dropdown.
  const profilePath = role === 'ADMIN' ? '/admin' : role === 'TRAINER' ? '/trainer/profile' : '/trainee/profile'

  const closeAll = () => {
    setNotifOpen(false)
    setProfileOpen(false)
    setSearchOpen(false)
  }

  // Close search when clicking outside.
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Lazy-load the public directory once per session for person search.
  useEffect(() => {
    let mounted = true
    getSearchableUsers().then((u) => mounted && setPeople(u)).catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearchOpen(false)
      return
    }
    const low = q.toLowerCase()
    const courseHits = courseCatalog
      .filter((c) => c.status === 'published' || c.status === 'featured')
      .filter(
        (c) =>
          c.title.toLowerCase().includes(low) ||
          c.description.toLowerCase().includes(low) ||
          (c.tags || []).some((t) => String(t).toLowerCase().includes(low)) ||
          String(c.domain || '').toLowerCase().includes(low),
      )
      .slice(0, 4)
      .map((c) => ({ kind: 'course', ...c }))
    const personHits = people
      .filter((u) => {
        const haystack = [
          u.name,
          u.title,
          u.station,
          u.region,
          u.organization,
          ...(u.expertise || []),
          ...(u.skills || []),
          ...(u.specializations || []),
          ...(u.qualifications || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(low)
      })
      .slice(0, 4)
    const updateHits = broadcasts
      .filter((b) => b.published && b.title.toLowerCase().includes(low))
      .slice(0, 3)
      .map((b) => ({ kind: 'update', ...b }))
    const next = [...courseHits, ...personHits, ...updateHits]
    setResults(next)
    setSearchOpen(true)
  }, [query, courseCatalog, broadcasts, people])

  const gotoUser = (u) => {
    const base = role === 'ADMIN' ? '/admin' : role === 'TRAINER' ? '/trainer' : '/trainee'
    closeAll()
    navigate(`${base}/profile/${u.uid}`)
  }

  const gotoCourse = (c) => {
    closeAll()
    const en = getEnrollment(c.id)
    if (role === 'TRAINEE' && en) navigate(`/trainee/workspace/${c.id}`)
    else navigate(role === 'ADMIN' ? '/admin' : role === 'TRAINER' ? '/trainer' : '/trainee')
  }

  const gotoUpdate = () => {
    closeAll()
    navigate(role === 'ADMIN' ? '/admin' : role === 'TRAINER' ? '/trainer' : '/trainee')
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border-subtle">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {onMenu && (
          <button
            onClick={onMenu}
            className="rounded-lg p-2 text-primary hover:bg-sky-light lg:hidden"
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
        )}

        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
            <ShieldCheck size={20} />
          </span>
          <span className="hidden text-sm font-semibold tracking-wide text-primary-deep sm:block">
            {title}
          </span>
        </div>

        {/* Global search */}
        <div className="relative ml-auto hidden md:block" ref={searchRef}>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
          <input
            id="topbar-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setSearchOpen(true)}
            placeholder="Search courses, trainers, trainees, updates..."
            className="w-64 rounded-lg border border-border-soft bg-sky-soft py-2 pl-9 pr-3 text-sm text-slate-deep outline-none placeholder:text-slate-muted focus:border-secondary focus:bg-white lg:w-80"
          />
          {searchOpen && query.trim() && (
            <div id="topbar-search-dropdown" className="absolute right-0 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-border-soft bg-white p-2 shadow-xl">
              {!results || results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-muted">No results found.</p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.kind === 'course' ? `c${r.id}` : r.kind === 'update' ? `u${r.id}` : `p${r.uid}`}
                    onClick={() => (r.kind === 'course' ? gotoCourse(r) : r.kind === 'update' ? gotoUpdate() : gotoUser(r))}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-sky-soft"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-light text-primary">
                      {r.kind === 'course' ? <BookOpen size={15} /> : r.kind === 'update' ? <Megaphone size={15} /> : <Users size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-primary-deep">
                        {r.kind === 'course' ? r.title : r.kind === 'update' ? r.title : r.name}
                      </span>
                      <span className="block truncate text-xs text-slate-muted">
                        {r.kind === 'course'
                          ? `${r.domain} · ${r.difficulty}`
                          : r.kind === 'update'
                          ? r.type
                          : `${roleLabel[r.role] || r.role}${r.station ? ` · ${r.station}` : ''}`}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative ml-auto md:ml-0">
          <button
            onClick={() => {
              setNotifOpen((v) => !v)
              setProfileOpen(false)
              setSearchOpen(false)
            }}
            className="relative rounded-lg p-2 text-slate-body hover:bg-sky-light"
          >
            <Bell size={20} />
            {badgeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border-soft bg-white p-2 shadow-xl">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted">
                  Notifications
                </p>
                {backendActive && unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs font-medium text-primary hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              {displayNotifs.length ? (
                <div className="max-h-96 overflow-y-auto scroll-thin">
                  {displayNotifs.slice(0, 5).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => readNotification(n)}
                      className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-sky-soft ${
                        backendActive && !n.isRead ? 'bg-sky-soft/60' : ''
                      }`}
                    >
                      <p className="flex items-center gap-2 text-sm font-medium text-primary-deep">
                        {backendActive && !n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-body">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-slate-muted">
                        {n.createdAt ? formatNotifDate(n.createdAt) : n.audienceLabel || ''}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-sm text-slate-muted">No notifications.</p>
              )}
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => {
              setProfileOpen((v) => !v)
              setNotifOpen(false)
              setSearchOpen(false)
            }}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-sky-light"
          >
            <Avatar name={currentUser?.name || 'U'} photoURL={currentUser?.photoURL} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-primary-deep">
                {currentUser?.name}
              </span>
              <span className="block text-xs text-slate-muted">
                {roleLabel[currentUser?.role]}
              </span>
            </span>
            <ChevronDown size={16} className="text-slate-muted" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border-soft bg-white p-1 shadow-xl">
              <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5">
                <Avatar name={currentUser?.name || 'U'} photoURL={currentUser?.photoURL} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary-deep">{currentUser?.name}</p>
                  <p className="truncate text-xs text-slate-muted">{currentUser?.email}</p>
                </div>
              </div>
              <button
                onClick={() => navigate(profilePath)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-body hover:bg-sky-soft"
              >
                <User size={16} /> My Profile
              </button>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function formatNotifDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}
