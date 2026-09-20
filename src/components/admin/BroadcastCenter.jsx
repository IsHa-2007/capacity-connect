import { useState } from 'react'
import { BellRing, Megaphone, Send } from 'lucide-react'
import { Card, Button, Badge, Modal } from '../common/ui'
import { STATIONS } from '../../data/mockData'
import { useBroadcasts } from '../../context/BroadcastContext'

const audiences = [
  { id: 'all-trainees', label: 'All Trainees' },
  { id: 'all-trainers', label: 'All Trainers' },
  { id: 'region', label: 'Specific Region' },
  { id: 'station', label: 'Specific Weather Station' },
  { id: 'group', label: 'Selected Groups' },
]

export default function BroadcastCenter() {
  const { broadcasts, publishBroadcast } = useBroadcasts()
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'Training announcement',
    audience: 'all-trainees',
    region: 'Northern Region',
    station: STATIONS[0],
  })
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const audienceLabel = {
    'all-trainees': 'All Trainees',
    'all-trainers': 'All Trainers',
    region: `Region: ${form.region}`,
    station: `Station: ${form.station}`,
    group: 'Selected Groups',
  }

  const audienceKey = (aud) => {
    if (aud === 'all-trainers') return 'all-trainers'
    if (aud === 'region' || aud === 'station' || aud === 'group') return 'all'
    return 'all-trainees'
  }

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await publishBroadcast({
        title: form.title,
        body: form.body,
        type: form.type,
        audience: form.audience,
        audienceKey: audienceKey(form.audience),
        audienceLabel: audienceLabel[form.audience],
        region: form.region,
        station: form.station,
      })
      setShow(false)
      const delivered = Number(result?.deliveredCount || 0)
      setSent(
        delivered
          ? `Broadcast sent successfully · delivered to ${delivered} recipient${delivered === 1 ? '' : 's'}.`
          : 'Broadcast sent successfully.',
      )
      setForm({ title: '', body: '', type: 'Training announcement', audience: 'all-trainees', region: 'Northern Region', station: STATIONS[0] })
    } catch (err) {
      setError(err?.message || 'The broadcast could not be sent. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary-deep">Broadcast Center</h2>
          <p className="text-sm text-slate-muted">
            Send training announcements, urgent updates, and operational notices to targeted groups.
          </p>
        </div>
        <Button onClick={() => setShow(true)}><Send size={16} /> New Broadcast</Button>
      </div>

      {sent && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sent}</div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="space-y-3">
        {broadcasts.map((b) => (
          <Card key={b.id} className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-light text-primary">
                <Megaphone size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-primary-deep">{b.title}</h4>
                  <Badge tone="blue">{b.type}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-body">{b.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
                  <Badge tone="slate">{b.audienceLabel || b.audience}</Badge>
                  <span>Sent {b.date}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <BroadcastModal open={show} onClose={() => setShow(false)} form={form} set={set} submit={submit} busy={busy} />
    </div>
  )
}

function BroadcastModal({ open, onClose, form, set, submit, busy }) {
  return (
    <Modal open={open} onClose={onClose} title="New Broadcast" size="max-w-xl">
      <div className="space-y-4">
        <Field label="Title">
          <input value={form.title} onChange={set('title')} placeholder="e.g. Urgent update on monsoon training" className="inp" />
        </Field>
        <Field label="Message">
          <textarea value={form.body} onChange={set('body')} rows={4} placeholder="Write the announcement details..." className="inp resize-none" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select value={form.type} onChange={set('type')} className="inp">
              {['Training announcement', 'Urgent update', 'Policy change', 'New course availability', 'Operational notice'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Audience">
            <select value={form.audience} onChange={set('audience')} className="inp">
              {audiences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>
        </div>
        {form.audience === 'region' && (
          <Field label="Select Region">
            <select value={form.region} onChange={set('region')} className="inp">
              {['Northern Region', 'Western Region', 'Eastern Region', 'Southern Region'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
        )}
        {form.audience === 'station' && (
          <Field label="Select Weather Station">
            <select value={form.station} onChange={set('station')} className="inp">
              {STATIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-sky-light px-4 py-3 text-sm text-primary-deep">
          <BellRing size={16} /> This broadcast will be delivered as a notification to the selected audience.
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}><Send size={15} /> {busy ? 'Sending…' : 'Send Broadcast'}</Button>
        </div>
      </div>
      <style>{`.inp{width:100%;border-radius:0.5rem;border:1px solid #DCE6F0;background:#F5F8FC;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#168c9b;background:#fff}`}</style>
    </Modal>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-primary-deep">{label}</label>
      {children}
    </div>
  )
}
