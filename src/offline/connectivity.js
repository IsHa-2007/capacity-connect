// MODULE 18.2 — Connectivity awareness (pure, framework-free).
//
// This module is the single source of truth for how CAPACITY CONNECT observes
// network state. It intentionally does NOT persist anything, replay requests,
// cache responses or touch authentication — those are out of scope for M18.2.
//
// Two independent signals are tracked:
//   1. Browser connectivity  — `navigator.onLine` + online/offline events.
//   2. Transport reachability — genuine fetch() rejections reported by the API
//      layer. An HTTP error response (401/403/404/409/422/429/500...) proves the
//      server WAS reached and therefore is NOT a transport failure.

export const OFFLINE_BANNER_TITLE = "You're offline"
export const OFFLINE_BANNER_BODY = "Some information may be unavailable until you're back online."
export const UNREACHABLE_BANNER_TITLE = "Can't reach the server"
export const UNREACHABLE_BANNER_BODY = "Check your connection. Some actions may be unavailable."
export const RECONNECTED_MESSAGE = "You're back online"
// Reusable, delivered by the write guard when a user-initiated authoritative
// write is attempted offline. The action is never performed or faked.
export const OFFLINE_WRITE_MESSAGE = "You're offline. This action requires an internet connection."

// Reads the browser's best-effort connectivity flag. Environments that do not
// expose navigator.onLine are treated as online so behaviour is unchanged.
export function readBrowserOnline() {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

// Subscribes to browser network transitions. Returns an unsubscribe function.
export function subscribeBrowserNetwork(listener) {
  if (typeof window === 'undefined') return () => {}
  const handleOnline = () => listener(true)
  const handleOffline = () => listener(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

// Transport/network-failure bus. Only genuine transport failures are reported;
// HTTP error responses must never report a failure (the server responded).
const transportListeners = new Set()

export function subscribeTransportStatus(listener) {
  transportListeners.add(listener)
  return () => transportListeners.delete(listener)
}

function emitTransportStatus(reachable) {
  for (const listener of transportListeners) listener(reachable)
}

export function reportTransportFailure() {
  emitTransportStatus(false)
}

export function reportTransportReachable() {
  emitTransportStatus(true)
}
