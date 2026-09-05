import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-white rounded-xl border border-border-soft shadow-[0_1px_3px_rgba(31,95,147,0.06)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Badge({ children, tone = 'blue', className = '' }) {
  const tones = {
    blue: 'bg-sky-light text-primary border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-rose-50 text-rose-700 border-rose-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
    navy: 'bg-primary-deep text-white border-primary-deep',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const map = {
    pending: ['Pending', 'amber'],
    approved: ['Approved', 'green'],
    rejected: ['Rejected', 'red'],
    inprogress: ['In Progress', 'blue'],
    completed: ['Completed', 'green'],
    published: ['Published', 'green'],
    draft: ['Draft', 'slate'],
    featured: ['Featured', 'navy'],
  }
  const [label, tone] = map[status] || [status, 'slate']
  return <Badge tone={tone}>{label}</Badge>
}

export function ProgressBar({ value = 0, className = '', color = 'bg-secondary' }) {
  return (
    <div className={`h-2 w-full rounded-full bg-[#EAF0F6] overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function Button({ variant = 'primary', className = '', children, ...props }) {
  const variants = {
    primary:
      'bg-primary text-white hover:bg-primary-dark shadow-[0_2px_6px_rgba(31,95,147,0.25)]',
    secondary:
      'bg-secondary text-white hover:bg-secondary/90 shadow-[0_2px_6px_rgba(78,132,183,0.25)]',
    outline:
      'bg-white text-primary border border-primary/30 hover:bg-sky-light',
    ghost: 'bg-transparent text-primary hover:bg-sky-light border border-transparent',
    soft: 'bg-sky-light text-primary hover:bg-blue-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    subtle: 'bg-white text-slate-body border border-border-soft hover:bg-sky-soft',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Modal({ open, onClose, title, children, size = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-primary-deep/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${size} max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-border-soft`}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h3 className="text-lg font-semibold text-primary-deep">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-muted hover:bg-sky-light hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-64px)] overflow-y-auto scroll-thin px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-[#EAF0F6] p-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            active === t
              ? 'bg-white text-primary shadow-sm'
              : 'text-slate-body hover:text-primary'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, description }) {
  const Icon = icon
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      {Icon && (
        <div className="mb-3 rounded-2xl bg-sky-light p-4 text-primary/60">
          <Icon size={28} />
        </div>
      )}
      <h4 className="font-semibold text-primary-deep">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-muted">{description}</p>}
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-14">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-light border-t-secondary" />
    </div>
  )
}

export function Avatar({
  name = '',
  photoURL = '',
  size = 'md',
  className = '',
}) {
  const sizeCls = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
    xl: 'h-20 w-20 text-2xl',
  }
  const initials = (name || 'U')
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/^(Dr|Mr|Mrs|Ms|Prof|Smt|Shri|Sri|Er)\.?$/i, '').charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-secondary font-semibold text-white ${sizeCls[size] || sizeCls.md} ${className}`}
    >
      {photoURL ? (
        <img src={photoURL} alt={name || 'User'} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'bg-sky-light text-primary',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    navy: 'bg-primary-deep text-white',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-primary-deep">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-muted">{sub}</p>}
        </div>
        {Icon && (
          <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </Card>
  )
}
