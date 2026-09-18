import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
})

const result = schema.safeParse(process.env)

if (!result.success) {
  console.error('[env] Missing or invalid environment configuration:')
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
  }
  console.error('[env] Copy server/.env.example to server/.env and fill in the values.')
  process.exit(1)
}

export const env = result.data