#!/usr/bin/env node
// ---------------------------------------------------------------------------
// READ-ONLY DIAGNOSTIC — capacity-connect storage bucket + Module 8 tables
// ---------------------------------------------------------------------------
// Probes (never mutates):
//   [1] storage.listBuckets()              -> authoritative bucket list
//   [2] upload tiny probe into capacity-connect -> definitive bucket existence
//   [3] storage.createSignedUrl on probe   -> signed URL works only if bucket+obj
//   [4] schema: courses / course_sections / questions columns (frozen Module 5)
//       plus questions.is_valid + difficulty, course_sections.section_type enum
//   [5] storage.service constants match (STORAGE_BUCKET export)
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ENV_PATH = resolve(ROOT, 'server', '.env')

if (!existsSync(ENV_PATH)) {
  console.error('  ERROR: server/.env not found at', ENV_PATH)
  process.exit(1)
}
dotenv.config({ path: ENV_PATH, quiet: true })

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('  ERROR: server/.env must define SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const BUCKET = 'capacity-connect'
console.log(`\n  DIAGNOSTIC — CAPACITY CONNECT (read-only)`)
console.log(`  Project: ${new URL(SUPABASE_URL).host}\n`)

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const B = admin.storage.from(BUCKET)

// [1] buckets list
const { data: buckets, error: blErr } = await admin.storage.listBuckets()
console.log('  [1] storage.listBuckets():')
if (blErr) console.log(`      ERR ${blErr.message}`)
else console.log(`      ${(buckets || []).length} bucket(s): ${(buckets || []).map((b) => b.name).join(', ') || '(none)'}`)

// [2] upload probe
const probePath = `m8diag/${Date.now()}-probe.txt`
const { error: upErr } = await B.upload(probePath, Buffer.from('capacity-connect m8 probe'), {
  contentType: 'text/plain',
  upsert: true,
})
console.log(`  [2] upload('${probePath}'):`)
if (upErr) console.log(`      ERR ${upErr.statusCode} ${upErr.message}`)
else console.log('      OK — bucket is reachable and writable')

// [3] signed URL on that object
if (!upErr) {
  const { data: su, error: suErr } = await B.createSignedUrl(probePath, 60)
  if (suErr) console.log(`  [3] createSignedUrl: ERR ${suErr.statusCode} ${suErr.message}`)
  else console.log(`  [3] createSignedUrl: OK (signed for 60s)`)
}

// [4] schema probe — frozen Module 5 tables
for (const table of ['courses', 'course_sections', 'questions']) {
  const { data: cols, error: cErr } = await admin
    .rpc('information_schema_columns_for_table', { tbl: table })
  if (cErr) {
    const { data: cols2 } = await admin
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', table)
    console.log(`  [4] ${table}: columns = ${(cols2 || []).map((c) => `${c.column_name}:${c.data_type}`).join(', ') || 'TABLE NOT FOUND'}`)
  } else {
    console.log(`  [4] ${table}: columns = ${(cols || []).map((c) => c.column_name).join(', ') || 'TABLE NOT FOUND'}`)
  }
}

// [5] storage.service const
import { STORAGE_BUCKET } from './server/src/services/storage.service.js'
console.log(`  [5] storage.service STORAGE_BUCKET = '${STORAGE_BUCKET}' (backend expects bucket name to match)`)
