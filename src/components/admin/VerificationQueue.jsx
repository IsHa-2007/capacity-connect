import { useState } from 'react'
import { BadgeCheck, Building2, Check, MapPin, ShieldCheck, X } from 'lucide-react'
import { Card, Button, Badge, Modal, EmptyState } from '../common/ui'
import { useAuth } from '../../context/AuthContext'

export default function VerificationQueue() {
  const { pendingUsers, allUsers, approveUser, rejectUser } = useAuth()
  const [selected, setSelected] = useState(null)

  const decide = (id, status) => {
    if (status === 'approved') approveUser(id)
    else rejectUser(id)
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">Verification Queue</h2>
        <p className="text-sm text-slate-muted">
          Review Government/Department IDs, Regional Weather Station credentials, and roles before approving accounts.
          Approving an account updates its real permissions across the platform.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="amber">{pendingUsers.length} pending</Badge>
        <Badge tone="green">{allUsers.filter((u) => u.status === 'approved').length} approved</Badge>
      </div>

      {pendingUsers.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pendingUsers.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-light text-primary">
                    <ShieldCheck size={20} />
                  </span>
                  <div>
                    <h4 className="font-semibold text-primary-deep">{v.name}</h4>
                    <Badge tone={v.role === 'TRAINER' ? 'navy' : 'blue'}>{v.role}</Badge>
                  </div>
                </div>
                <Badge tone="amber">Pending</Badge>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-slate-body">
                <p className="flex items-center gap-2"><MapPin size={14} className="text-slate-muted" /> {v.station} Weather Station</p>
                <p className="flex items-center gap-2"><Building2 size={14} className="text-slate-muted" /> {v.department}</p>
                <p className="flex items-center gap-2"><BadgeCheck size={14} className="text-slate-muted" /> Govt ID: {v.empId}</p>
              </div>
              {v.expertise?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.expertise.map((e) => <Badge key={e}>{e}</Badge>)}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="primary" size="sm" className="flex-1" onClick={() => decide(v.id, 'approved')}>
                  <Check size={15} /> Approve
                </Button>
                <Button variant="danger" size="sm" className="flex-1" onClick={() => decide(v.id, 'rejected')}>
                  <X size={15} /> Reject
                </Button>
              </div>
              <button onClick={() => setSelected(v)} className="mt-3 w-full text-center text-xs font-medium text-primary hover:underline">
                Review full details
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={ShieldCheck} title="Queue is clear" description="No accounts pending administrative verification right now." />
        </Card>
      )}

      {/* History */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4">
          <h3 className="font-semibold text-primary-deep">Verification History</h3>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-y border-border-subtle bg-sky-soft text-xs uppercase tracking-wide text-slate-muted">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Department ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {allUsers.map((v) => (
                <tr key={v.id} className="hover:bg-sky-soft/50">
                  <td className="px-6 py-3 font-medium text-primary-deep">{v.name}</td>
                  <td className="px-4 py-3"><Badge tone={v.role === 'TRAINER' ? 'navy' : 'blue'}>{v.role}</Badge></td>
                  <td className="px-4 py-3 text-slate-muted">{v.empId}</td>
                  <td className="px-4 py-3">
                    <Badge tone={v.status === 'approved' ? 'green' : v.status === 'rejected' ? 'red' : 'amber'}>{v.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <VerificationModal entry={selected} onClose={() => setSelected(null)} onDecide={decide} />
    </div>
  )
}

function VerificationModal({ entry, onClose, onDecide }) {
  if (!entry) return null
  return (
    <Modal open={!!entry} onClose={onClose} title="Account Verification Review" size="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary"><ShieldCheck size={26} /></span>
          <div>
            <h4 className="text-lg font-semibold text-primary-deep">{entry.name}</h4>
            <Badge tone={entry.role === 'TRAINER' ? 'navy' : 'blue'}>{entry.role}</Badge>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReviewRow label="Department" value={entry.department} />
          <ReviewRow label="Station" value={entry.station} />
          <ReviewRow label="Govt ID" value={entry.empId} />
          <ReviewRow label="Designation" value={entry.title} />
          <ReviewRow label="Email" value={entry.email} />
        </div>
        {entry.expertise?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.expertise.map((e) => <Badge key={e}>{e}</Badge>)}
          </div>
        )}
        <div className="rounded-xl border border-blue-100 bg-sky-light p-4 text-sm text-primary-deep">
          <p className="font-medium">Verification Checklist</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-body">
            <li>✓ Government / Department ID present</li>
            <li>✓ Regional Weather Station credential present</li>
            <li>✓ Role and departmental details present</li>
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button variant="danger" onClick={() => onDecide(entry.id, 'rejected')}><X size={15} /> Reject</Button>
          <Button variant="primary" onClick={() => onDecide(entry.id, 'approved')}><Check size={15} /> Approve Account</Button>
        </div>
      </div>
    </Modal>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-sky-soft p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-primary-deep">{value ?? '—'}</p>
    </div>
  )
}
