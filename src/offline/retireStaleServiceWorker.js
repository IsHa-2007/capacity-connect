// M19 — ONE-TIME RETIREMENT OF THE INCOMPATIBLE PRE-ROOT SERVICE WORKER.
//
// WHY THIS EXISTS
// Production shipped for a while with Vite `base: '/capacity-connect/'` (a
// GitHub Pages subpath). That build registered its generated worker at
// `/capacity-connect/sw.js` with scope `/capacity-connect/`, and the workbox
// precache manifest recorded `/capacity-connect/index.html` as the shell.
//
// The app is now deployed at the ROOT of the Vercel domain, so that worker is
// incompatible on two counts:
//   1. It is a DIFFERENT script URL from the current root worker, so workbox's
//      `registerType: 'autoUpdate'` can never replace it — browsers would keep
//      the stale worker alive indefinitely.
//   2. Its navigation fallback points at `/capacity-connect/index.html`, which
//      does not exist on the root domain, producing the
//      `non-precached-url :: ["/capacity-connect/index.html"]` console error.
//
// So the old worker is removed explicitly rather than waited out. This module
// unregisters every service worker whose script URL is not the current root
// worker, then drops the app-owned API runtime caches so no response written by
// the retired build can be reused.
//
// GUARANTEES (deliberately narrow):
//   * Never unregisters the current root worker — only foreign ones.
//   * Touches nothing but Service Worker registrations and this app's own
//     Cache Storage entries. No Supabase, auth, backend or API code is affected.
//   * Never fabricates offline data; it only deletes caches it owns.
//   * Every step is best-effort: any failure leaves the app exactly as it was.

import { purgeApiCache } from './apiCache.js'

// The worker this build registers (see `base` in vite.config.js). With a root
// deployment the generated worker is served from the domain root.
export const SERVICE_WORKER_PATH = '/sw.js'

// Absolute URL of the worker this build expects to control the origin.
export function expectedServiceWorkerUrl() {
  const origin = globalThis.location?.origin
  return origin ? new URL(SERVICE_WORKER_PATH, origin).href : SERVICE_WORKER_PATH
}

// The script URL a registration is currently running, across all three
// lifecycle states (installing/waiting/active).
function registrationScriptUrl(registration) {
  return (
    registration.active?.scriptURL ||
    registration.waiting?.scriptURL ||
    registration.installing?.scriptURL ||
    ''
  )
}

// Unregisters every same-origin service worker that is NOT the expected root
// worker. Returns the script URLs that were retired (empty when there is
// nothing to do, which is the steady-state happy path).
export async function retireIncompatibleServiceWorkers() {
  const retired = []

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return retired

  let registrations = []
  try {
    registrations = await navigator.serviceWorker.getRegistrations()
  } catch {
    // Registration list unavailable (private browsing, blocked storage). There
    // is nothing we can safely retire, and nothing to report.
    return retired
  }

  const expected = expectedServiceWorkerUrl()
  for (const registration of registrations) {
    const scriptUrl = registrationScriptUrl(registration)
    if (!scriptUrl || scriptUrl === expected) continue
    try {
      await registration.unregister()
      retired.push(scriptUrl)
    } catch {
      // Could not retire this one; the current worker still registers and
      // claims clients, so the app remains functional either way.
    }
  }

  // Only purge the API runtime cache when a foreign worker was actually
  // retired, so a normal visit does no extra Cache Storage work. `purgeApiCache`
  // deletes strictly by this app's own cache-name prefix.
  if (retired.length > 0) await purgeApiCache()

  return retired
}
