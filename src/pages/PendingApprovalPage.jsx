import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock, MapPin, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function PendingApprovalPage() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()

  const homeForRole =
    currentUser?.role === 'TRAINER' ? '/trainer' : currentUser?.role === 'TRAINEE' ? '/trainee' : '/'

  return (
    <div className="flex min-h-screen items-center justify-center bg-sky-soft p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border-soft bg-white p-8 shadow-[0_8px_30px_rgba(31,95,147,0.08)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock size={32} />
        </div>
        <h2 className="mt-5 text-center text-xl font-semibold text-primary-deep">Account Pending Verification</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-body">
          Your account is currently under administrative review. An authorized administrator
          must verify your Government/Department ID and Regional Weather Station credentials
          before you can access operational modules.
        </p>

        {/* Limited account information */}
        {currentUser && (
          <div className="mt-5 rounded-xl border border-border-soft bg-sky-soft p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary-deep">
              <UserRound size={15} className="text-primary" /> {currentUser.name}
            </p>
            <div className="mt-2 space-y-1.5 text-sm text-slate-body">
              <p className="flex items-center gap-2"><ShieldCheck size={14} className="text-slate-muted" /> Requested role: {currentUser.role}</p>
              <p className="flex items-center gap-2"><ShieldCheck size={14} className="text-slate-muted" /> Department: {currentUser.department || 'Regional Centre'}</p>
              <p className="flex items-center gap-2"><MapPin size={14} className="text-slate-muted" /> Regional Weather Station: {currentUser.station}</p>
              <p className="flex items-center gap-2"><ShieldCheck size={14} className="text-slate-muted" /> Verification status: <span className="font-medium text-amber-600">Pending review</span></p>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-slate-body">
          You can still explore the platform while your account is being verified.
        </p>
        <div className="mt-5 grid gap-3">
          <button
            onClick={() => navigate(homeForRole)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <BookOpen size={16} /> Explore Courses & Check Status
          </button>
          <button
            onClick={logout}
            className="rounded-lg border border-border-soft bg-white py-2.5 text-sm font-medium text-slate-body hover:bg-sky-soft"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
