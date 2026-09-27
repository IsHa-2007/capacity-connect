import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import { buildApiRuntimeCachingEntries } from './src/offline/apiCache.js'

// PUBLIC base path for the build.
//
// PRODUCTION serves the app from the ROOT of the domain
// (https://capacity-connect-7zpc.vercel.app), so the default is '/'. Every asset
// URL, the manifest start_url/scope, the precached shell and the service-worker
// navigation fallback are ALL derived from this one value, so they can no longer
// disagree with each other or with the deployment target.
//
// The legacy GitHub Pages project (repo `capacity-connect`) published under a
// subpath; that target is opt-in only via `BASE_PATH=/capacity-connect/ npm run
// build`. It is deliberately NOT the default, because a `/capacity-connect/`
// base on the root Vercel domain makes every asset URL and the workbox
// navigation fallback point at paths that do not exist there.
const base = process.env.BASE_PATH || '/'

// Workbox's NavigationRoute matches its allowlist/denylist against
// `url.pathname + url.search` (verified in the bundled workbox runtime), so these
// are path-anchored regexes. Deriving them from `base` keeps the fallback scoped
// to exactly the paths this build actually serves.
const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const navigationAllowlist = [new RegExp(`^${escapeForRegExp(base)}`)]
// The backend is a separate origin, so this deny rule is about the frontend
// origin only: a navigation must never be answered with the app shell when the
// path is an API path (e.g. if the same origin ever gains an /api mount).
const navigationDenylist = [/^\/api\//]

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    // M18.1 — PWA foundation: precache the built app shell only.
    // No runtime caching of backend data is configured here (that is M18.3+).
    VitePWA({
      // The app registers the worker itself (src/main.jsx) in production only,
      // so Vite HMR and `npm run dev` are never touched by a live service worker.
      injectRegister: null,
      registerType: 'autoUpdate',
      // Never run the service worker during `vite dev`.
      devOptions: { enabled: false },
      manifest: {
        name: 'Capacity Connect',
        short_name: 'Capacity Connect',
        description: 'Scientific Capacity Building and Readiness Platform for IMD and MoES.',
        // Root-scoped on the production (Vercel) domain, so these resolve to
        // '/', '/pwa-192x192.png', ... and never to a '/capacity-connect/' path.
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: '#1F5F93',
        background_color: '#F5F8FC',
        icons: [
          { src: `${base}pwa-64x64.png`, sizes: '64x64', type: 'image/png' },
          { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}maskable-icon-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the static build output (app shell). Backend/API responses are
        // deliberately NOT precached; runtime caching is M18.3's bounded, GET-only
        // allowlist (see `buildApiRuntimeCachingEntries`) — see runtimeCaching.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Offline SPA navigation falls back to the cached shell index.html.
        navigateFallback: `${base}index.html`,
        // Only this build's own navigations use the fallback; API paths are
        // never served the shell. Full shell-font/API responses come
        // exclusively from the M18.3 read-only runtime routes below — never
        // from this fallback.
        navigateFallbackAllowlist: navigationAllowlist,
        navigateFallbackDenylist: navigationDenylist,
        // M18.3 — safe read-only runtime caching of the explicit GET allowlist
        // (NetworkFirst, bounded/expiring, status-200 only, purged on auth).
        runtimeCaching: buildApiRuntimeCachingEntries(),
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
})
