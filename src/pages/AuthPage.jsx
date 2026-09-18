import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CloudSun, Lock, Mail, MapPin, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { STATIONS, EXPERTISE_OPTIONS } from '../data/mockData'

export default function AuthPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialMode = params.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState(initialMode)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    department: '',
    empId: '',
    station: STATIONS[0],
    title: '',
    role: 'TRAINEE',
    expertise: '',
    experience: '',
    professionalSummary: '',
    qualifications: '',
    trainingInterests: '',
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const switchMode = (m) => {
    setMode(m)
    setError('')
    setFlash('')
  }

  // Split a comma-separated string into a trimmed, non-empty list.
  const toList = (value) =>
    String(value || '')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'login') {
      const res = await login({ email: form.email, password: form.password })
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Route by role via /home (RoleHome). Pending accounts land on the
      // Pending Approval screen; approved users go to their dashboard.
      navigate('/home')
    } else {
      const res = await register({
        ...form,
        // Canonical API field. The local form field is `name`; send `fullName`
        // explicitly so the wire payload always matches the backend contract.
        fullName: form.name,
        qualifications: toList(form.qualifications),
        trainingInterests: toList(form.trainingInterests),
        expertise: form.expertise || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Public registration may REQUEST a TRAINEE or TRAINER account, but NEVER
      // ADMIN. Both roles are created PENDING and verified by an administrator.
      setFlash('Registration successful. Your account is pending verification. Please wait for administrative approval.')
      setMode('login')
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border-soft bg-sky-soft py-2.5 pl-10 pr-3 text-sm text-slate-deep outline-none placeholder:text-slate-muted focus:border-secondary focus:bg-white'

  return (
    <div className="flex min-h-screen bg-sky-soft">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-primary to-primary-deep lg:block">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute left-10 top-10 h-64 w-64 rounded-full bg-secondary blur-3xl" />
          <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-accent blur-3xl" />
        </div>
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-white">
              <CloudSun size={22} />
            </span>
            <span className="text-lg font-semibold tracking-wide">CAPACITY CONNECT</span>
          </div>
          <div>
            <h2 className="text-3xl font-semibold leading-snug">
              Build verified scientific capacity across India's meteorological workforce.
            </h2>
            <p className="mt-4 max-w-md text-sm text-blue-100">
              India Meteorological Department · Ministry of Earth Sciences. Measurable
              competencies, dynamic assessments, and verified certifications.
            </p>
          </div>
          <p className="text-xs text-blue-200/70">
            Secure · Intelligent · Scientific · Professional · Trusted
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
              <ShieldCheck size={18} />
            </span>
            <span className="font-semibold text-primary-deep">CAPACITY CONNECT</span>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#EAF0F6] p-1">
            <button
              onClick={() => switchMode('login')}
              className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-white text-primary shadow-sm' : 'text-slate-body'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === 'register' ? 'bg-white text-primary shadow-sm' : 'text-slate-body'
              }`}
            >
              Register
            </button>
          </div>

          {flash && (
            <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {flash}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                {/* Account type: TRAINEE or TRAINER only. ADMIN is never
                    selectable — it is provisioned server-side (see footer). */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-primary-deep">I am registering as</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['TRAINEE', 'TRAINER'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: r }))}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          form.role === r
                            ? 'border-primary bg-primary text-white shadow-[0_2px_6px_rgba(31,95,147,0.25)]'
                            : 'border-border-soft bg-white text-slate-body hover:bg-sky-light'
                        }`}
                      >
                        {r === 'TRAINEE' ? 'Trainee (learner)' : 'Trainer (expert)'}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-muted">
                    {form.role === 'TRAINER'
                      ? 'Trainer accounts require the professional details below for administrator review.'
                      : 'Trainees sign up with their official ID and station.'}
                  </p>
                </div>

                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
                  <input required value={form.name} onChange={set('name')} placeholder="Full name" className={inputCls} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
                    <select value={form.station} onChange={set('station')} className="w-full rounded-lg border border-border-soft bg-sky-soft py-2.5 pl-9 pr-3 text-sm text-slate-deep outline-none focus:border-secondary">
                      {STATIONS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <input required value={form.empId} onChange={set('empId')} placeholder="Government / Department ID (e.g. IMD-FC-0001)" className={inputCls} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-muted">ID</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.department} onChange={set('department')} placeholder="Department" className="w-full rounded-lg border border-border-soft bg-sky-soft py-2.5 px-3 text-sm outline-none focus:border-secondary" />
                  <input value={form.title} onChange={set('title')} placeholder="Designation" className="w-full rounded-lg border border-border-soft bg-sky-soft py-2.5 px-3 text-sm outline-none focus:border-secondary" />
                </div>

                {form.role === 'TRAINER' && (
                  <div className="space-y-3 rounded-xl border border-blue-100 bg-sky-light/60 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-primary-deep">Domain expertise</label>
                        <select value={form.expertise} onChange={set('expertise')} className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm outline-none focus:border-secondary">
                          <option value="">Select…</option>
                          {EXPERTISE_OPTIONS.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-primary-deep">Years of experience</label>
                        <input value={form.experience} onChange={set('experience')} type="number" min="0" placeholder="e.g. 10" className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm outline-none focus:border-secondary" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-primary-deep">Professional summary</label>
                      <textarea value={form.professionalSummary} onChange={set('professionalSummary')} rows={2} placeholder="Brief summary of your expertise and training experience" className="w-full resize-none rounded-lg border border-border-soft bg-white px-3 py-2 text-sm outline-none focus:border-secondary" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-primary-deep">Qualifications</label>
                      <input value={form.qualifications} onChange={set('qualifications')} placeholder="e.g. Ph.D. Atmospheric Science, M.Sc. Meteorology (comma-separated)" className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-sm outline-none focus:border-secondary" />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
              <input required value={form.email} onChange={set('email')} type="email" placeholder="Official email" className={inputCls} />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
              <input required value={form.password} onChange={set('password')} type="password" placeholder="Password" className={inputCls} />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(31,95,147,0.25)] hover:bg-primary-dark"
            >
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-border-soft bg-white p-4 text-xs text-slate-muted">
            <p className="font-medium text-primary-deep">Getting started</p>
            <p className="mt-1.5">
              Register a new account above to get started. Your account will be
              pending admin approval before full access is granted.
            </p>
            <p className="mt-1.5">
              Trainee and trainer accounts start pending verification and are
              approved by an administrator. Administrator accounts are
              provisioned server-side only.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
