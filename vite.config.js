import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import { buildApiRuntimeCachingEntries } from './src/offline/apiCache.js'

// GitHub Pages subpath for the Capacity Connect deployment. Kept in one place so
// the manifest, service-worker scope and precached shell stay in sync with Vite.
const base = '/capacity-connect/'

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
        // Only same-app navigations use the fallback; API paths are never served
        // the shell. Full shell-font/API responses come exclusively from the
        // M18.3 read-only runtime routes below — never from this fallback.
        navigateFallbackAllowlist: [/^\/capacity-connect\//],
        navigateFallbackDenylist: [/^\/capacity-connect\/api\//],
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
