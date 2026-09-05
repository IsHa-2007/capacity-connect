import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldAlert, UserCog } from 'lucide-react'
import { Card, Button, Badge, Modal, EmptyState } from '../common/ui'
import { Avatar } from '../common/ui'
import { useAuth } from '../../context/AuthContext'

const ROLES = ['TRAINEE', 'TRAINER', 'ADMIN']

export default function AdminUserManagement() {
  const { allUsers, changeUserRole } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [pendingChange, setPendingChange] = useState(null)
  const [draftRole, setDraftRole] = useState('')

  const list = useMemo(
    () =>
      allUsers.filter((u) =>
        filter === 'all' ? true : filter === 'admin' ? u.role === 'ADMIN' : u.role === filter,
      ),
    [allUsers, filter],
  )

  const statusTone = (u) => {
    if (u.status === 'approved') return 'green'
    if (u.status === 'pending') return 'amber'
    return 'rose'
  }

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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">User Management</h2>
        <p className="text-sm text-slate-muted">
          Change account roles and view public profiles for trainers and trainees across the platform.
        </p>
      </div>

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
        <Badge tone="blue">{list.length} users</Badge>
      </div>

      {list.length ? (
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
                <Badge tone={statusTone(u)}>{String(u.status).toUpperCase()}</Badge>
              </div>

              <div className="col-span-3 flex justify-end">
                <Button variant="subtle" onClick={() => navigate(`/admin/profile/${u.uid || u.id}`)}>
                  View Full Profile <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={UserCog} title="No users" description="There are no users in this category." />
        </Card>
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
