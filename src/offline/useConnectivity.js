import { createContext, useCallback, useContext } from 'react'
import { OFFLINE_WRITE_MESSAGE } from './connectivity'

// Context is defined separately from the provider component so the provider
// file only exports a component (keeps the module fast-refresh friendly).
export const ConnectivityContext = createContext(null)

export function useConnectivity() {
  const context = useContext(ConnectivityContext)
  if (!context) {
    throw new Error('useConnectivity must be used within a ConnectivityProvider')
  }
  return context
}

// Reusable guard for user-initiated authoritative writes. Returns true when the
// action may proceed. When offline it returns false and surfaces the standard
// offline message (via onBlocked, or the global indicator), WITHOUT performing,
// queueing or faking the write. Callers are responsible for doing nothing on a
// false return.
export function useOfflineWriteGuard() {
  const { isOnline, notifyWriteBlocked } = useConnectivity()
  return useCallback(
    (onBlocked) => {
      if (isOnline) return true
      if (typeof onBlocked === 'function') onBlocked(OFFLINE_WRITE_MESSAGE)
      else notifyWriteBlocked(OFFLINE_WRITE_MESSAGE)
      return false
    },
    [isOnline, notifyWriteBlocked],
  )
}
