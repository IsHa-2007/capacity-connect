import { AlertTriangle, CheckCircle2, CloudOff, WifiOff } from 'lucide-react'
import { useConnectivity } from './useConnectivity'
import {
  OFFLINE_BANNER_BODY,
  OFFLINE_BANNER_TITLE,
  OFFLINE_WRITE_MESSAGE,
  RECONNECTED_MESSAGE,
  UNREACHABLE_BANNER_BODY,
  UNREACHABLE_BANNER_TITLE,
} from './connectivity'

// Global connectivity indicator. Renders nothing while everything is healthy.
// Purely observational: it never blocks or intercepts a request.
export function OfflineStatus() {
  const { isOffline, hasTransportFailure, writeBlocked, recovered } = useConnectivity()

  let state = null
  if (writeBlocked) {
    state = { tone: 'bg-primary', icon: AlertTriangle, title: OFFLINE_WRITE_MESSAGE, body: '' }
  } else if (isOffline) {
    state = { tone: 'bg-amber-600', icon: WifiOff, title: OFFLINE_BANNER_TITLE, body: OFFLINE_BANNER_BODY }
  } else if (hasTransportFailure) {
    state = { tone: 'bg-amber-600', icon: CloudOff, title: UNREACHABLE_BANNER_TITLE, body: UNREACHABLE_BANNER_BODY }
  } else if (recovered) {
    state = { tone: 'bg-emerald-600', icon: CheckCircle2, title: RECONNECTED_MESSAGE, body: '' }
  }

  if (!state) return null
  const Icon = state.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 z-50 ${state.tone} text-white shadow-[0_-2px_10px_rgba(15,23,42,0.18)]`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2.5 px-4 py-2 text-sm sm:px-6">
        <Icon size={16} className="shrink-0" />
        <span className="font-medium">{state.title}</span>
        {state.body && <span className="hidden text-white/85 sm:inline">{state.body}</span>}
      </div>
    </div>
  )
}
