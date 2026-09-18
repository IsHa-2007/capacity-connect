#!/usr/bin/env node
// Idempotent provisioning of the PRIVATE `capacity-connect` Supabase Storage
// bucket using the repo's own supabaseAdmin client (same one storage.service.js
// uses). Purely additive: no schema change, no tables, no data.
// Loads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from server/.env.
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { supabaseAdmin } from './src/lib/supabaseAdmin.js'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '.env')
if (!existsSync(envPath)) {
  console.error('ERROR: server/.env missing')
  process.exit(1)
}
dotenv.config({ path: envPath, quiet: true })

const BUCKET = 'capacity-connect'
console.log('\n  PROVISION STORAGE BUCKET (PRIVATE)\n')

const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets()
if (listErr) {
  console.error('  listBuckets error:', listErr.message)
  process.exit(1)
}
console.log('  current buckets:', JSON.stringify(buckets || []))

if ((buckets || []).some((b) => b.name === BUCKET)) {
  console.log(`\n  Bucket "${BUCKET}" already exists — nothing to do.\n`)
  process.exit(0)
}

const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
  public: false,
  fileSizeLimit: null,
  allowedMimeTypes: null,
})
if (createErr) {
  console.error('  createBucket error:', createErr.message)
  process.exit(1)
}

const { data: created } = await supabaseAdmin.storage.getBucket(BUCKET)
console.log('  created:', JSON.stringify(created))

const { data: listed } = await supabaseAdmin.storage.listBuckets()
console.log('  after:', JSON.stringify(listed || []))

const { data: up } = await supabaseAdmin.storage.from(BUCKET).upload(
  'm8probe/provision-verify.txt',
  Buffer.from('m8 bucket verified'),
  { contentType: 'text/plain', upsert: true },
)
console.log('  upload probe:', up ? 'OK' : 'ERR')

if (up) {
  const { data: su } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl('m8probe/provision-verify.txt', 60)
  console.log('  signed URL probe:', su ? 'OK (len=' + (su.signedUrl || '').length + ')' : 'ERR')
  await supabaseAdmin.storage.from(BUCKET).remove(['m8probe/provision-verify.txt'])
  console.log('  cleanup remove: OK')
}
console.log('\n  Done.\n')
process.exit(0)
