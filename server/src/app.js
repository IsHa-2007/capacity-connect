import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import routes from './routes/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

function allowedOrigins() {
  if (env.NODE_ENV === 'production') return [env.CLIENT_ORIGIN]
  return [env.CLIENT_ORIGIN, /^https?:\/\/localhost:\d+$/]
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