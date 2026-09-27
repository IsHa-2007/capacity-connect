import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import routes from './routes/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

// The app's real public frontend origin, served from the ROOT of its own domain.
// This is a stable, first-party origin, so it is allowed in every environment.
const PRODUCTION_ORIGIN = 'https://capacity-connect-7zpc.vercel.app'

// `CLIENT_ORIGIN` remains honoured, and may now list several origins separated
// by commas. This is the supported way to allow an extra origin (e.g. a Vercel
// preview deployment) WITHOUT a code change: Vercel deployment URLs are
// generated per build and change on every deploy, so they must never be
// hardcoded here.
function configuredOrigins() {
  return String(env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function allowedOrigins() {
  const configured = configuredOrigins()
  if (env.NODE_ENV === 'production') return [PRODUCTION_ORIGIN, ...configured]
  // Development keeps the existing localhost support (any Vite dev port).
  return [PRODUCTION_ORIGIN, ...configured, /^https?:\/\/localhost:\d+$/]
}

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: allowedOrigins(),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  if (env.NODE_ENV === 'development') {
    app.use(morgan('dev'))
  }

  app.use('/api', routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}