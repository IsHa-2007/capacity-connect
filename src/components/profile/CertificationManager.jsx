import { useEffect, useState } from 'react'
import { Award, Calendar, Eye, Link2, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Card, Modal } from '../common/ui'
import InAppFileViewer from './InAppFileViewer'
import {
  addCertification as addMockCertification,
  updateCertification as updateMockCertification,
  removeCertification as removeMockCertification,
  uploadCertificationFile as uploadMockCertificationFile,
} from '../../services/userService'
import * as userApi from '../../services/userApi'

const EMPTY = {
  title: '',
  issuingOrganization: '',
  issueDate: '',
  expiryDate: '',
  credentialId: '',
  credentialUrl: '',
  description: '',
}

export default function CertificationManager({ uid, certifications = [] }) {
  const { currentUser, refreshUserProfile } = useAuth()
  const backendActive = currentUser?.authSource === 'supabase'

  // Owned certifications. Mock sessions derive from the profile prop (and
  // refresh the auth profile on write); real (supabase) sessions read + write
  // the authoritative backend and keep a local mirror for instant UI updates.
  const [items, setItems] = useState(certifications)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!backendActive) return
    let active = true
    userApi
      .listMyCertifications()
      .then((list) => {
        if (active) setItems(list)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[CertificationManager] Failed to load certifications:', err.message)
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [backendActive])

  // Mock sessions render straight from the profile prop (writes refresh it via
  // the auth context); real sessions render the backend mirror.
  const displayItems = backendActive ? items : certifications

  const createId = () => `cert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const refresh = async () => {
    if (backendActive) {
      setItems(await userApi.listMyCertifications())
    } else {
      await refreshUserProfile()
    }
  }

  const handleSave = async (data) => {
    setBusy(true)
    setError('')
    try {
      if (backendActive) {
        if (editing?.id) await userApi.updateMyCertification(editing.id, data)
        else await userApi.addMyCertification(data)
      } else if (editing && editing.id) {
        await updateMockCertification(uid, editing.id, data)
      } else {
        await addMockCertification(uid, { ...data, id: createId() })
      }
      await refresh()
      setShowForm(false)
      setEditing(null)
    } catch (err) {
      setError(err?.message || 'The certification could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (cert) => {
    setBusy(true)
    setError('')
    try {
      if (backendActive) await userApi.removeMyCertification(cert.id)
      else await removeMockCertification(uid, cert.id)
      await refresh()
    } catch (err) {
      setError(err?.message || 'The certification could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (cert, file) => {
    if (!file || !cert) return
    setBusy(true)
    setError('')
    try {
      if (backendActive) {
        const uploaded = await userApi.uploadCertificationFile(file)
        // The upload carries the metadata the backend stores alongside the file
        // reference, so the row keeps its title/issuer/dates.
        await userApi.updateMyCertification(cert.id, {
          title: cert.title,
          issuingOrganization: cert.issuingOrganization,
          issueDate: cert.issueDate,
          expiryDate: cert.expiryDate,
          credentialId: cert.credentialId,
          credentialUrl: cert.credentialUrl,
          ...uploaded,
        })
      } else {
        await uploadMockCertificationFile(uid, cert.id, file)
      }
      await refresh()
    } catch (err) {
      setError(err?.message || 'The file could not be uploaded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
          <Award size={17} className="text-primary" /> Professional Certifications
        </h3>
        <Button size="sm" variant="soft" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={15} /> Add Certification
        </Button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {displayItems.length ? (
        <div className="mt-4 space-y-3">
          {displayItems.map((cert) => (
            <div key={cert.id} className="rounded-xl border border-border-soft bg-sky-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
                    <Award size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-primary-deep">{cert.title}</p>
                    <p className="text-xs text-slate-muted">{cert.issuingOrganization}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
                      <span className="inline-flex items-center gap-1"><Calendar size={12} /> {formatDate(cert.issueDate)}</span>
                      {cert.expiryDate && <span className="inline-flex items-center gap-1">Exp {formatDate(cert.expiryDate)}</span>}
                      {cert.credentialId && <span className="inline-flex items-center gap-1">ID {cert.credentialId}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {cert.fileURL && (
                    <Button variant="soft" onClick={() => setViewing(cert)}>
                      <Eye size={14} /> View
                    </Button>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-2 text-xs font-medium text-primary hover:bg-sky-light">
                    <Upload size={14} />
                    {cert.fileURL ? 'Replace File' : 'Add File'}
                    <input
                      type="file"
                      className="hidden"
                      accept="application/pdf,image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(cert, f); e.target.value = '' }}
                    />
                  </label>
                  <Button variant="subtle" onClick={() => { setEditing(cert); setShowForm(true); }}>
                    <Pencil size={14} /> Edit
                  </Button>
                  <Button variant="subtle" onClick={() => handleRemove(cert)} disabled={busy}>
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
              </div>

              {cert.credentialUrl && (
                <a href={cert.credentialUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Link2 size={12} /> Credential link
                </a>
              )}
              {cert.description && <p className="mt-2 text-xs text-slate-body">{cert.description}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-muted">
          No professional certifications added yet. Add certifications to strengthen your verified professional profile.
        </p>
      )}

      <CertForm
        open={showForm}
        editing={editing}
        showDescription={!backendActive}
        onClose={() => { setShowForm(false); setEditing(null); setError('') }}
        onSave={handleSave}
        busy={busy}
      />

      <InAppFileViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        fileURL={viewing?.fileURL}
        fileType={viewing?.fileType || viewing?.mimeType}
        title={viewing?.title}
      />
    </Card>
  )
}

function CertForm({ open, editing, onSave, busy, onClose, showDescription = true }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  // Re-sync form when opening for a new or existing certification.
  const [prevKey, setPrevKey] = useState(null)
  const key = editing ? editing.id : 'new'
  if (open && key !== prevKey) {
    setPrevKey(key)
    setForm(
      editing
        ? { ...EMPTY, ...editing }
        : EMPTY,
    )
    setError('')
  }
  if (!open && prevKey) setPrevKey(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = () => {
    if (!form.title.trim() || !form.issuingOrganization.trim() || !form.issueDate) {
      setError('Title, issuing organization and issue date are required.')
      return
    }
    if (form.expiryDate && form.issueDate && form.expiryDate < form.issueDate) {
      setError('Expiry date cannot be before the issue date.')
      return
    }
    onSave({ ...form })
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Certification' : 'Add Certification'} size="max-w-xl">
      <div className="space-y-4">
        <Field label="Certification title *">
          <input value={form.title} onChange={set('title')} placeholder="e.g. Certified Meteorologist" className="pf-inp" />
        </Field>
        <Field label="Issuing organization *">
          <input value={form.issuingOrganization} onChange={set('issuingOrganization')} placeholder="e.g. IMD, NCMRWF, WMO" className="pf-inp" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Issue date *">
            <input type="date" value={form.issueDate} onChange={set('issueDate')} className="pf-inp" />
          </Field>
          <Field label="Expiry date (if applicable)">
            <input type="date" value={form.expiryDate} onChange={set('expiryDate')} className="pf-inp" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Credential ID">
            <input value={form.credentialId} onChange={set('credentialId')} placeholder="e.g. CC-2026-0001" className="pf-inp" />
          </Field>
          <Field label="Credential URL">
            <input value={form.credentialUrl} onChange={set('credentialUrl')} placeholder="https://..." className="pf-inp" />
          </Field>
        </div>
        {showDescription && (
          <Field label="Description (optional)">
            <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Briefly describe the certification" className="pf-inp resize-none" />
          </Field>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save Certification'}</Button>
        </div>
      </div>
      <style>{`.pf-inp{width:100%;border-radius:0.5rem;border:1px solid #DCE6F0;background:#F5F8FC;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none;color:#004aad}.pf-inp:focus{border-color:#168c9b;background:#fff}`}</style>
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

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}
