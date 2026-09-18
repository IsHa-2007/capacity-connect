import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`[server] Capacity Connect API listening on http://localhost:${env.PORT}`)
  console.log(`[server] Environment: ${env.NODE_ENV}`)
  console.log(`[server] Health: GET http://localhost:${env.PORT}/api/health`)
})

function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down.`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))