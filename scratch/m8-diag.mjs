#!/usr/bin/env node
// READ-ONLY DIAGNOSTIC — capacity-connect storage bucket + Module 8 tables
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ENV_PATH = resolve(ROOT, 'server', '.env')

if (!existsSync(ENV_PATH)) {
  console.error('ERROR: server/.env not found')
  process.exit(1)
}
dotenv.config({ path: ENV_PATH, quiet: true })

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: server/.env must define SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const BUCKET = 'capacity-connect'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

console.log(`\n  CAPACITY CONNECT — read-only Module 8 diagnostic`)
console.log(`  Project: ${new URL(SUPABASE_URL).host}\n`)

// [1] list buckets
const { data: buckets, error: listErr } = await supabaseAdmin.storage.listBuckets()
console.log(`  [1] listBuckets(): ${listErr ? 'ERR ' + listErr.message : JSON.stringify(buckets)}`)

// [2] direct upload probe (authoritative existence check)
const probePath = `m8diag/${Date.now()}-probe.txt`
const { data: upData, error: upErr } = await supabaseAdmin.storage
  .from(BUCKET)
  .upload(probePath, Buffer.from('capacity-connect module8 probe'), {
    contentType: 'text/plain',
    upsert: true,
  })
console.log(`  [2] upload('${probePath}'): ${upErr ? 'ERR ' + upErr.message : 'OK'}`)

// [3] createSignedUrl on the object (proves signed-URL path works)
if (!upErr) {
  const { error: suErr } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(probePath, 60)
  console.log(`  [3] createSignedUrl: ${suErr ? 'ERR ' + suErr.message : 'OK (signed for 60s)'}`)
}

// [4] schema probe — find the 3 Module 5 tables + columns
for (const table of ['courses', 'course_sections', 'questions']) {
  const { data: cols, error: cErr } = await supabaseAdmin
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', table)
  const names = (cols || []).map((c) => c.column_name).join(', ')
  console.log(`  [4] "${table}": ${cErr ? 'ERR ' + cErr.message : (names || 'TABLE NOT FOUND')}`)
}

// [5] pruning probe
if (upData && upData.path) {
  const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([probePath])
  console.log(`  [5] remove: ${rmErr ? 'ERR ' + rmErr.message : 'OK (probe pruned)'}`)
}

console.log('')
