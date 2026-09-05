import { useState } from 'react'
import { Camera, Save, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Modal } from '../common/ui'
import { STATIONS, EXPERTISE_OPTIONS, SPECIALIZATION_MAP } from '../../data/mockData'
import { uploadProfilePhoto } from '../../services/userService'
import { regionFor } from '../../services/userService'

const SKILL_OPTIONS = [
  'Data Analysis',
  'Numerical Modeling',
  'Radar Interpretation',
  'Satellite Image Analysis',
  'Forecast Verification',
  'Severe Weather Warning',
  'Hydrological Modeling',
  'Climate Projection',
  'Programming (Python)',
  'GIS / Remote Sensing',
  'Operational Forecasting',
  'Risk & Disaster Analysis',
]

/**
 * Reusable professional-profile editor used by both Trainee and Trainer views.
 * Works for PENDING and APPROVED users (no approval required to edit).
 * Never allows modifying role / approvalStatus / uid / auth email.
 */
export default function ProfileEditor({ open, onClose }) {
  const { currentUser, updateProfile, refreshUserProfile } = useAuth()

  const [fields, setFields] = useState(() => snapshot(currentUser, false))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openedKey, setOpenedKey] = useState(null)

  // Re-hydrate the form whenever the modal is (re)opened.
  const key = open && currentUser ? currentUser.uid : 'closed'
  if (open && key !== openedKey) {
    setOpenedKey(key)
    setFields(snapshot(currentUser, false))
    setError('')
  }
  if (!open && openedKey) setOpenedKey(null)

  if (!open || !currentUser) return null

  const uid = currentUser.uid
  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }))

  const addTextItem = (k) => {
    setFields((f) => {
      const val = f[`${k}Input`] || ''
      if (!val.trim()) return f
      return { ...f, [k]: [...(Array.isArray(f[k]) ? f[k] : []), val.trim()], [`${k}Input`]: '' }
    })
  }
  const removeTextItem = (k, idx) => {
    setFields((f) => ({ ...f, [k]: (Array.isArray(f[k]) ? f[k] : []).filter((_, i) => i !== idx) }))
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file for the profile photo.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be under 5 MB.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const updated = await uploadProfilePhoto(uid, file)
      if (updated) setFields(snapshot(updated, false))
      await refreshUserProfile()
    } catch {
      setError('Could not upload profile photo.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!fields.fullName || !fields.station || !fields.title) {
      setError('Full name, designation and station are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await updateProfile({
        fullName: fields.fullName,
        title: fields.title,
        station: fields.station,
        region: regionFor(fields.station),
        organization: fields.organization,
        department: fields.department,
        professionalSummary: fields.professionalSummary,
        yearsOfExperience: fields.yearsOfExperience === '' || fields.yearsOfExperience == null ? '' : Number(fields.yearsOfExperience),
        skills: fields.skills,
        expertise: fields.expertise,
        specializations: fields.specializations,
        trainingInterests: fields.trainingInterests,
        qualifications: fields.qualifications,
        achievements: fields.achievements,
      })
      if (!res || res.ok === false) {
        setError(res?.error || 'Could not save profile.')
      } else {
        onClose()
      }
    } catch {
      setError('Could not save profile. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Professional Profile" size="max-w-3xl">
      <div className="space-y-5">
        {/* Profile photo */}
        <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-sky-soft p-4">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary text-2xl font-semibold text-white">
            {fields.photoURL ? (
              <img src={fields.photoURL} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              fields.fullName?.charAt(0) || '?'
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-primary-deep">Profile photo</p>
            <p className="text-xs text-slate-muted">Upload a professional photo (JPG/PNG, max 5 MB).</p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-primary shadow-sm hover:bg-sky-light">
              <Camera size={14} /> Choose photo
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
          </div>
        </div>

        {/* Identity */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *"><input value={fields.fullName} onChange={set('fullName')} className="pf-inp" /></Field>
          <Field label="Designation *"><input value={fields.title} onChange={set('title')} placeholder="e.g. Meteorologist Grade-II" className="pf-inp" /></Field>
          <Field label="Department"><input value={fields.department} onChange={set('department')} className="pf-inp" /></Field>
          <Field label="Organization"><input value={fields.organization} onChange={set('organization')} className="pf-inp" /></Field>
          <Field label="Regional Weather Station *">
            <select value={fields.station} onChange={set('station')} className="pf-inp">
              {STATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Region"><input value={regionFor(fields.station)} disabled className="pf-inp bg-slate-50 text-slate-500" /></Field>
        </div>

        {/* Email (read-only — controlled by authentication) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-primary-deep">Official email</label>
          <input value={currentUser.email || fields.email || ''} disabled className="pf-inp bg-slate-50 text-slate-500" />
          <p className="mt-1 text-xs text-slate-muted">Email is managed by the organisation and cannot be changed from the profile.</p>
        </div>

        {/* Professional summary / experience */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Professional summary / About">
            <textarea value={fields.professionalSummary} onChange={set('professionalSummary')} rows={3} placeholder="Brief professional summary" className="pf-inp resize-none" />
          </Field>
          <Field label="Years of experience">
            <input
              type="number"
              min="0"
              step="1"
              value={fields.yearsOfExperience}
              onChange={(e) => setFields((f) => ({ ...f, yearsOfExperience: e.target.value }))}
              placeholder="e.g. 8"
              className="pf-inp"
            />
          </Field>
        </div>

        {/* Dropdown selectors */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Domain expertise (primary)">
            <select
              value={fields.expertise?.[0] || ''}
              onChange={(e) => setFields((f) => ({ ...f, expertise: e.target.value ? [e.target.value] : [] }))}
              className="pf-inp"
            >
              <option value="">Select a domain of expertise…</option>
              {EXPERTISE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <SingleSelectMulti label="Specializations" value={fields.specializations} onChange={(v) => setFields((f) => ({ ...f, specializations: v }))} options={SPECIALIZATION_MAP[fields.expertise?.[0]] || []} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChipMulti label="Skills" value={fields.skills} onChange={(v) => setFields((f) => ({ ...f, skills: v }))} options={SKILL_OPTIONS} />
          <ChipMulti label="Areas of training interest" value={fields.trainingInterests} onChange={(v) => setFields((f) => ({ ...f, trainingInterests: v }))} options={EXPERTISE_OPTIONS} />
        </div>

        {/* Free-form lists */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FreeList label="Qualifications" value={fields.qualifications} inputValue={fields.qualificationsInput || ''} onInput={(v) => setFields((f) => ({ ...f, qualificationsInput: v }))} onAdd={() => addTextItem('qualifications')} onRemove={(i) => removeTextItem('qualifications', i)} placeholder="e.g. M.Sc. Atmospheric Science" />
          <FreeList label="Professional achievements" value={fields.achievements} inputValue={fields.achievementsInput || ''} onInput={(v) => setFields((f) => ({ ...f, achievementsInput: v }))} onAdd={() => addTextItem('achievements')} onRemove={(i) => removeTextItem('achievements', i)} placeholder="e.g. Notable forecast contribution" />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" onClick={onClose}><X size={15} /> Cancel</Button>
          <Button onClick={submit} disabled={busy}><Save size={15} /> {busy ? 'Saving…' : 'Save Changes'}</Button>
        </div>
      </div>
      <style>{`.pf-inp{width:100%;border-radius:0.5rem;border:1px solid #DCE6F0;background:#F5F8FC;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none;color:#1F5F93}.pf-inp:focus{border-color:#4E84B7;background:#fff}`}</style>
    </Modal>
  )
}

function snapshot(u) {
  return {
    fullName: u?.fullName || u?.name || '',
    email: u?.email || '',
    title: u?.title || '',
    department: u?.department || '',
    organization: u?.organization || 'India Meteorological Department',
    station: u?.station || STATIONS[0],
    professionalSummary: u?.professionalSummary || '',
    yearsOfExperience: u?.yearsOfExperience || u?.experience || '',
    skills: Array.isArray(u?.skills) ? u.skills : [],
    expertise: Array.isArray(u?.expertise) ? u.expertise : [],
    specializations: Array.isArray(u?.specializations) ? u.specializations : [],
    trainingInterests: Array.isArray(u?.trainingInterests) ? u.trainingInterests : [],
    qualifications: Array.isArray(u?.qualifications) ? u.qualifications : [],
    achievements: Array.isArray(u?.achievements) ? u.achievements : [],
    photoURL: u?.photoURL || '',
  }
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-primary-deep">{label}</label>
      {children}
    </div>
  )
}

function ChipMulti({ label, value = [], onChange, options = [] }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-primary-deep">{label}</label>
      <div className="flex flex-wrap gap-2 rounded-xl border border-border-subtle bg-sky-soft p-3">
        {options.map((opt) => {
          const on = (value || []).includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(on ? value.filter((v) => v !== opt) : [...value, opt])}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                on ? 'bg-primary text-white' : 'bg-white text-primary-deep border border-border-soft hover:bg-blue-100'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SingleSelectMulti({ label, value = [], onChange, options = [] }) {
  const rest = options.filter((o) => !(value || []).includes(o))
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-primary-deep">{label}</label>
      <select
        value=""
        onChange={(e) => e.target.value && onChange([...(value || []), e.target.value])}
        className="pf-inp"
      >
        <option value="">{options.length ? `Add a ${label.toLowerCase().slice(0, -1)}…` : 'Select a domain expertise first…'}</option>
        {rest.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {Array.isArray(value) && value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((item) => (
            <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white">
              {item}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== item))} className="text-white/80 hover:text-white" aria-label={`Remove ${item}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FreeList({ label, value = [], inputValue, onInput, onAdd, onRemove, placeholder }) {  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-primary-deep">{label}</label>
      <div className="flex gap-2">
        <input value={inputValue || ''} onChange={(e) => onInput(e.target.value)} placeholder={placeholder} className="pf-inp" />
        <Button type="button" variant="soft" onClick={onAdd}>Add</Button>
      </div>
      {Array.isArray(value) && value.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {value.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg border border-border-subtle bg-sky-soft px-3 py-2 text-sm text-primary-deep">
              <span>{item}</span>
              <button type="button" onClick={() => onRemove(idx)} className="text-slate-muted hover:text-rose-600"><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
