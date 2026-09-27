import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// M18.1 — register the PWA service worker in production/preview builds only.
// `vite dev` never registers a worker, so Vite HMR and local development are
// unaffected. The worker precaches only the static app shell (no backend data).
if (import.meta.env.PROD) {
  // M19 — retire any worker left over from the old `/capacity-connect/` build
  // BEFORE registering the current root-scoped one. The old worker lives at a
  // different script URL, so `autoUpdate` can never replace it on its own; until
  // it is unregistered it keeps serving a shell that does not exist on this
  // domain. Best-effort: any failure still falls through to registration.
  import('./offline/retireStaleServiceWorker.js')
    .then(({ retireIncompatibleServiceWorkers }) => retireIncompatibleServiceWorkers())
    .catch(() => {})
    .finally(() => import('virtual:pwa-register'))
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {})
}
