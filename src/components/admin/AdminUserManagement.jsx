import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Search, ShieldAlert, UserCog, X } from 'lucide-react'
import { Card, Button, Badge, Modal, EmptyState } from '../common/ui'
import { Avatar } from '../common/ui'
import { useAuth } from '../../context/AuthContext'
import * as userApi from '../../services/userApi'
import { cloudPhotoUrl } from '../../services/userApi'

const ROLES = ['TRAINEE', 'TRAINER', 'ADMIN']

// Normalise backend (public.users) search rows into the display shape used by
// the management list (id+uid, name, status, photoURL).
function toRow(u) {
  return {
    ...u,
    id: u.uid || u.id,
    uid: u.uid || u.id,
    name: u.fullName || u.name,
    status: String(u.approvalStatus || u.approval_status || '').toLowerCase(),
    photoURL: u.photoURL || cloudPhotoUrl(u.photoPublicId) || '',
  }
}

export default function AdminUserManagement() {
  const { allUsers, changeUserRole, currentUser } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [browse, setBrowse] = useState('')
  const [pendingChange, setPendingChange] = useState(null)
  const [draftRole, setDraftRole] = useState('')

  // Backend capability search state (null = idle / browsing).
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)

  const list = useMemo(() => {
    const term = browse.trim().toLowerCase()
    return allUsers
      .filter((u) =>
        filter === 'all' ? true : filter === 'admin' ? u.role === 'ADMIN' : u.role === filter,
      )
      .filter((u) =>
        term
          ? [u.name, u.station, u.title, u.empId, u.email]
              .some((v) => v && String(v).toLowerCase().includes(term))
          : true,
      )
  }, [allUsers, filter, browse])

  // The primary approved administrator cannot be demoted, otherwise the platform
  // risks losing its only governance account.
  const soleApprovedAdmin = (u) =>
    u.role === 'ADMIN' &&
    u.status === 'approved' &&
    allUsers.filter((x) => x.role === 'ADMIN' && x.status === 'approved').length === 1

  const openChangeRole = (u) => {
    if (soleApprovedAdmin(u)) return
    setPendingChange({ uid: u.uid || u.id, name: u.name, role: u.role })
    setDraftRole(u.role)
  }

  const confirmChange = async () => {
    if (!pendingChange) return
    await changeUserRole(pendingChange.uid, draftRole)
    setPendingChange(null)
  }

  // Capability search across ALL users. Real admins hit the backend
  // GET /api/users/search which queries users.search_vector (name, expertise,
  // specializations, skills, qualifications, achievements, training interests);
  // the dev mock path filters the loaded directory locally so the demo works
  // without the backend.
  const runSearch = async (e) => {
    e?.preventDefault()
    const term = q.trim()
    if (!term) {
      setResults(null)
      return
    }
    setSearching(true)
    try {
      if (currentUser?.authSource === 'supabase') {
        const data = await userApi.searchUsers(term)
        setResults((data?.results || []).map(toRow))
      } else {
        const termL = term.toLowerCase()
        const matches = allUsers.filter((u) =>
          [
            u.name,
            u.title,
            u.station,
            u.department,
            ...(u.expertise || []),
            ...(u.specializations || []),
            ...(u.skills || []),
            ...(u.qualifications || []),
            ...(u.achievements || []),
            ...(u.trainingInterests || []),
          ].some((v) => v && String(v).toLowerCase().includes(termL)),
        )
        setResults(matches.map(toRow))
      }
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const clearSearch = () => {
    setQ('')
    setResults(null)
  }

  const capabilityChips = (u) =>
    [u.expertise, u.specializations, u.skills, u.qualifications, u.achievements, u.trainingInterests]
      .flat()
      .filter(Boolean)
      .slice(0, 6)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">User Management</h2>
        <p className="text-sm text-slate-muted">
          Browse accounts, search by capability (Python, AI, GIS, Cybersecurity, …), and change roles across the
          platform.
        </p>
      </div>

      {/* Capability search */}
      <form onSubmit={runSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all users by capability… e.g. Python, AI, GIS, Cybersecurity, Satellite imagery"
            className="w-full rounded-lg border border-border-soft bg-sky-soft py-2.5 pl-10 pr-3 text-sm text-slate-deep outline-none placeholder:text-slate-muted focus:border-secondary focus:bg-white"
          />
          {q && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-muted hover:text-rose-600"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <Button type="submit" disabled={searching}>{searching ? 'Searching…' : 'Search'}</Button>
        {results !== null && (
          <Button variant="subtle" onClick={clearSearch}>Clear results</Button>
        )}
      </form>

      {results === null ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'TRAINEE', 'TRAINER', 'ADMIN'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f === 'all' ? 'all' : f)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f ? 'border-primary bg-primary text-white' : 'border-border-soft bg-white text-slate-body hover:bg-sky-light'
                }`}
              >
                {f === 'all' ? 'All' : f === 'TRAINEE' ? 'Trainees' : f === 'TRAINER' ? 'Trainers' : 'Admins'}
              </button>
            ))}
            <input
              value={browse}
              onChange={(e) => setBrowse(e.target.value)}
              placeholder="Filter by name / station / ID…"
              className="ml-auto w-56 rounded-lg border border-border-soft bg-white px-3 py-1.5 text-xs outline-none focus:border-secondary"
            />
            <Badge tone="blue">{list.length} users</Badge>
          </div>

          <UserTable list={list} soleApprovedAdmin={soleApprovedAdmin} openChangeRole={openChangeRole} navigate={navigate} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="navy">Capability search</Badge>
            <span className="text-sm text-slate-muted">
              {searching ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'} for “${q.trim()}”`}
            </span>
          </div>
          {results.length ? (
            <div className="overflow-hidden rounded-2xl border border-border-soft bg-white">
              {results.map((u) => (
                <div key={u.id} className="grid grid-cols-1 items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-0 md:grid-cols-12">
                  <div className="col-span-5 flex items-center gap-3">
                    <Avatar name={u.name} photoURL={u.photoURL} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-primary-deep">{u.name}</p>
                      <p className="truncate text-xs text-slate-muted">{u.station || '—'} {u.role ? `· ${u.role}` : ''}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {capabilityChips(u).map((c) => (
                          <span key={c} className="rounded-full bg-sky-light px-2 py-0.5 text-[11px] font-medium text-primary">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <Badge tone={u.role === 'TRAINER' ? 'navy' : 'blue'}>{u.role}</Badge>
                  </div>
                  <div className="col-span-4 flex justify-end">
                    <Button variant="subtle" onClick={() => navigate(`/admin/profile/${u.id}`)}>
                      View Full Profile <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState icon={Search} title="No matches" description="No users matched this capability search." />
            </Card>
          )}
        </>
      )}

      <Modal
        open={!!pendingChange}
        onClose={() => setPendingChange(null)}
        title="Change User Role"
        size="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm">
              Select the new role for <b>{pendingChange?.name}</b>. This updates their real
              permissions across the platform and takes effect immediately.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-primary-deep">New Role</label>
            <select
              value={draftRole}
              onChange={(e) => setDraftRole(e.target.value)}
              className="w-full rounded-lg border border-border-soft bg-sky-soft px-3 py-2 text-sm text-slate-deep outline-none focus:border-secondary"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="subtle" onClick={() => setPendingChange(null)}>Cancel</Button>
            <Button onClick={confirmChange} disabled={!pendingChange || draftRole === pendingChange.role}>Confirm Change</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function UserTable({ list, soleApprovedAdmin, openChangeRole, navigate }) {
  if (!list.length) {
    return (
      <Card>
        <EmptyState icon={UserCog} title="No users" description="There are no users in this category." />
      </Card>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border-soft bg-white">
      <div className="hidden grid-cols-12 gap-3 border-b border-border-soft bg-sky-soft px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-muted md:grid">
        <span className="col-span-5">User</span>
        <span className="col-span-2">Role</span>
        <span className="col-span-2">Status</span>
        <span className="col-span-3 text-right">Actions</span>
      </div>
      {list.map((u) => (
        <div key={u.uid || u.id} className="grid grid-cols-1 items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-0 md:grid-cols-12">
          <div className="col-span-5 flex items-center gap-3">
            <Avatar name={u.name} photoURL={u.photoURL} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-primary-deep">{u.name}</p>
              <p className="truncate text-xs text-slate-muted">{u.station || '—'} {u.title ? `· ${u.title}` : ''}</p>
            </div>
          </div>

          <div className="col-span-2">
            <button
              onClick={() => openChangeRole(u)}
              disabled={soleApprovedAdmin(u)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-sky-light px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCog size={13} /> {u.role}
            </button>
          </div>

          <div className="col-span-2">
            <Badge tone={u.status === 'approved' ? 'green' : u.status === 'pending' ? 'amber' : 'rose'}>
              {String(u.status).toUpperCase()}
            </Badge>
          </div>

          <div className="col-span-3 flex justify-end">
            <Button variant="subtle" onClick={() => navigate(`/admin/profile/${u.uid || u.id}`)}>
              View Full Profile <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}