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
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {})
}
