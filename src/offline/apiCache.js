// MODULE 18.3 — SAFE READ-ONLY RUNTIME CACHE POLICY
//
// This module is the single source of truth for WHAT may be cached and HOW the
// cache is bounded. It is dependency-free and safe to import from BOTH the Vite
// build config (Node) and the browser app:
//
//   * vite.config.js imports `buildApiRuntimeCachingEntries()` to generate the
//     Workbox `runtimeCaching` routes.
//   * The authentication lifecycle imports `purgeApiCache()` to invalidate the
//     cache on login / logout / session clear.
//
// GUARANTEES:
//   * ONLY method-GET responses from the explicit allowlist below are cached.
//   * Every mutation verb (POST/PUT/PATCH/DELETE) is excluded by construction.
//   * No access token is ever written to Cache Storage. The token lives only in
//     the `Authorization` request header as before.
//   * HTTP error responses are never cached (status 200 only); Workbox falls
//     back to cache only on a genuine transport failure, never on 4xx/5xx.
//
// CROSS-USER HYGIENE (critical):
//   Workbox keys a cache entry by REQUEST URL, so the storage layer cannot, by
//   itself, keep two users apart for endpoints whose URL is identical (e.g.
//   `/api/users/me`). The backend is authenticated per request, so the ONLY safe
//   mechanism available to a `generateSW` worker is lifecycle invalidation: the
//   dedicated cache is purged on every authentication transition. A response
//   cached for user A is therefore gone before user B can ever read it. See
//   `purgeApiCache` and its call sites in src/context/AuthContext.jsx.
//
// UI SEAM:
//   src/offline/CachedDataIndicator.jsx is the truthful label seam. A per-
//   response "served from cache" signal is intentionally NOT wired here: this
//   build uses Workbox `generateSW`, which cannot add a page-visible marker to a
//   cross-origin (CORS-filtered) cached response. The indicator stays unrendered
//   until a real source signal exists (would require an injectManifest worker).
//   It never fabricates a timestamp or a "live" claim.

export const API_RUNTIME_CACHE_NAME = 'capacity-connect-api-v1'

// Deleting by prefix also removes superseded cache versions from older builds.
export const API_CACHE_NAME_PREFIX = 'capacity-connect-api-'

// Conservative growth bounds for the read-only cache (M18.2 principle: cache
// metadata, never files — no PDFs/PPTX/videos are ever cached here).
export const API_CACHE_MAX_ENTRIES = 80
export const API_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 // 24 hours

// EXPLICIT ALLOWLIST of cacheable GET endpoints, matched against the FULL URL.
// Each pattern is anchored to the start of the URL and to a real route boundary
// so it can never accidentally swallow a sibling route. WHY EACH IS SAFE:
//   * `/api/courses`, `/api/courses/:id`, `/api/courses/:id/sections` — global
//     catalogue content, read-only and identical for every authorised viewer.
//   * `/api/users/me`, `/api/users/me/certifications` — the CALLER'S OWN profile
//     and certifications (user-scoped; safe only because the cache is purged on
//     every auth transition).
//   * `/api/notifications`, `/api/notifications/unread-count` — the CALLER'S OWN
//     notifications (user-scoped; purge-protected).
//   * `/api/broadcasts` — the CALLER'S audience-scoped notices (user-scoped;
//     purge-protected).
//   * `/api/enrollments`, `/api/enrollments/:id`, `/api/enrollments/:id/workspace`
//     — the CALLER'S OWN enrollments and course content (user-scoped;
//     purge-protected).
// DELIBERATELY NOT MATCHED (excluded): `/api/auth/*` (login/register/logout/me),
// certificate issuance + public verification, assessment start/submit/attempts,
// course questions (assessment-adjacent), the user directory/search/other-user
// profiles, all `/api/analytics/*` admin aggregates, every upload route and
// every non-GET route.
export const READ_ONLY_GET_PATTERNS = [
  /^https?:\/\/[^/]+\/api\/courses(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/courses\/[^/?#]+(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/courses\/[^/?#]+\/sections(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/users\/me(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/users\/me\/certifications(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/notifications(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/notifications\/unread-count(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/broadcasts(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/enrollments(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/enrollments\/[^/?#]+(?:[?#]|$)/i,
  /^https?:\/\/[^/]+\/api\/enrollments\/[^/?#]+\/workspace(?:[?#]|$)/i,
]

// True when a URL is on the safe read-only allowlist. GET-only is enforced
// separately (method), never by URL alone.
export function matchesReadOnlyGet(url) {
  const href = String(url)
  return READ_ONLY_GET_PATTERNS.some((pattern) => pattern.test(href))
}

// Builds the Workbox `generateSW` runtimeCaching routes from the allowlist.
// Every route is a method-GET NetworkFirst with a bounded, expiring dedicated
// cache and status-200-only cacheability (so 4xx/5xx are never stored).
export function buildApiRuntimeCachingEntries() {
  return READ_ONLY_GET_PATTERNS.map((urlPattern) => ({
    urlPattern,
    handler: 'NetworkFirst',
    method: 'GET',
    options: {
      cacheName: API_RUNTIME_CACHE_NAME,
      cacheableResponse: { statuses: [200] },
      expiration: {
        maxEntries: API_CACHE_MAX_ENTRIES,
        maxAgeSeconds: API_CACHE_MAX_AGE_SECONDS,
        purgeOnQuotaError: true,
      },
    },
  }))
}

// Removes every Capacity Connect runtime API cache. Called on login, logout and
// session clear so cached responses can never leak across authenticated users.
// Best-effort: if Cache Storage is unavailable there is nothing to purge.
export async function purgeApiCache() {
  if (typeof caches === 'undefined') return
  try {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter((name) => name.startsWith(API_CACHE_NAME_PREFIX))
        .map((name) => caches.delete(name)),
    )
  } catch {
    /* Cache Storage unavailable or blocked — nothing to purge */
  }
}
