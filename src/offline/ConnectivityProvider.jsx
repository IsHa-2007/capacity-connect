import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConnectivityContext } from './useConnectivity'
import {
  OFFLINE_WRITE_MESSAGE,
  readBrowserOnline,
  subscribeBrowserNetwork,
  subscribeTransportStatus,
} from './connectivity'

const WRITE_BLOCKED_VISIBLE_MS = 5000
const RECOVERED_VISIBLE_MS = 4000

// Tracks browser connectivity and transport reachability for the whole app.
// It holds no cache and performs no writes — it only exposes observable state
// plus a way to surface the standard "offline write" message.
export function ConnectivityProvider({ children }) {
  const [isOnline, setIsOnline] = useState(readBrowserOnline)
  const [serverReachable, setServerReachable] = useState(true)
  const [writeBlocked, setWriteBlocked] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const problemRef = useRef(!readBrowserOnline())

  // Browser online/offline transitions. Coming back online clears the
  // transport-failure hint; the next request will re-report if the server is
  // still unreachable.
  useEffect(
    () =>
      subscribeBrowserNetwork((online) => {
        setIsOnline(online)
        if (online) setServerReachable(true)
      }),
    [],
  )

  // Genuine transport failures reported by the API layer.
  useEffect(() => subscribeTransportStatus(setServerReachable), [])

  const isOffline = !isOnline
  const hasTransportFailure = isOnline && !serverReachable
  const isProblem = isOffline || hasTransportFailure

  // Show a brief "back online" confirmation when a problem clears.
  useEffect(() => {
    const wasProblem = problemRef.current
    problemRef.current = isProblem
    if (wasProblem && !isProblem) {
      setRecovered(true)
      const timer = setTimeout(() => setRecovered(false), RECOVERED_VISIBLE_MS)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isProblem])

  // Auto-dismiss the write-blocked notice.
  useEffect(() => {
    if (!writeBlocked) return undefined
    const timer = setTimeout(() => setWriteBlocked(false), WRITE_BLOCKED_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [writeBlocked])

  const notifyWriteBlocked = useCallback((message = OFFLINE_WRITE_MESSAGE) => {
    // The message is intentionally not stored as content: M18.2 has one
    // canonical write message, so we only toggle visibility. Unknown custom
    // messages still fall back to the standard copy in the indicator.
    void message
    setWriteBlocked(true)
  }, [])

  const value = useMemo(
    () => ({
      isOnline,
      isOffline,
      serverReachable,
      hasTransportFailure,
      isProblem,
      recovered,
      writeBlocked,
      notifyWriteBlocked,
    }),
    [
      isOnline,
      isOffline,
      serverReachable,
      hasTransportFailure,
      isProblem,
      recovered,
      writeBlocked,
      notifyWriteBlocked,
    ],
  )

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>
}
