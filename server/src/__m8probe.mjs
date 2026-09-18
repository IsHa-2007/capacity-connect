// ---------------------------------------------------------------------------
// READ-ONLY Module 8 schema probe (frozen Module 5 tables) — deleted after run
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env'), quiet: true })

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const BUCKET = 'capacity-connect'
const adminE = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

console.log(`\n  M8 SCHEMA PROBE — project ${new URL(SUPABASE_URL).host}`)
for (const table of ['courses', 'course_sections', 'questions']) {
  const { data: cols, error } = await adminE
    .from('information_schema.columns')
    .select('column_name', 'data_type')
    .eq('table_schema', 'public')
    .eq('table_name', table)
  if (error) {
    console.log(`  [${table}] probe-err: ${error.message}`)
    continue
  }
  const names = (cols || []).map((c) => c.column_name).join(', ')
  console.log(`  [${table}] ${cols ? `${cols.length} columns → ${names}` : 'TABLE NOT FOUND'}`)
}
const { data: b, error: be } = await adminE.storage.listBuckets()
console.log(`  [buckets] ${be ? 'ERR ' + be.message : JSON.stringify(b || [])}`)
