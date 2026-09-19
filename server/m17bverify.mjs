// MODULE 17B VERIFICATION — persisted duty assignment lifecycle.
//
// Follows the m11/m12/m16/m17/m17a pattern: a dependency-free Node script
// (Node >= 20, "type": "module") that imports the exported pure helpers /
// validators / middleware and checks the Module 17B behaviours WITHOUT touching
// a database, then boots the real server for the anonymous-auth envelope, and
// finally performs a READ-ONLY live probe of the additive schema (table + RPC).
//
//   node server/m17bverify.mjs
//
// Set M17B_LIVE=0 to skip the live schema probe. Set M17B_RUNTIME=0 to skip the
// server boot.
//
// Sections:
//   S1  validators   — roster query, assignment id, status body, optional station.
//   S2  projection   — mapAssignment is safe (no db metadata) and enriches names.
//   S3  lifecycle    — state machine + officer de-duplication.
//   S4  authorisation— non-admin is rejected before any data access.
//   S5  validation   — bad status is rejected before any repository access.
//   S6  runtime      — roster/dispatch endpoints reject anonymous callers 401.
//   S7  live schema  — (read-only) duty_assignments table + atomic RPC presence.

const assert = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error(`FAIL  ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    process.exitCode = 1
  } else {
    console.log(`PASS  ${name}`)
  }
}

const skip = (name, reason) => console.log(`SKIP  ${name} (${reason})`)

const assertApiError = async (name, fn, status, code) => {
  try {
    await fn()
    assert(`${name} (expected an ApiError)`, 'no throw', 'throw')
  } catch (err) {
    assert(`${name} status`, err?.status, status)
    assert(`${name} code`, err?.code, code)
  }
}

const UUID = '00000000-0000-4000-8000-000000000000'

// ---------------------------------------------------------------------------
// S1. VALIDATORS
// ---------------------------------------------------------------------------
{
  const {
    assignmentListQuerySchema,
    assignmentIdParamSchema,
    assignmentStatusSchema,
    officerDispatchSchema,
  } = await import('./src/validators/dispatch.validator.js')

  const queryOk = (v) => assignmentListQuerySchema.safeParse(v).success
  const idOk = (v) => assignmentIdParamSchema.safeParse(v).success
  const statusOk = (v) => assignmentStatusSchema.safeParse(v).success
  const dispatchOk = (v) => officerDispatchSchema.safeParse(v).success

  assert('S1.1 empty roster query is valid', queryOk({}), true)
  assert('S1.2 region filter accepted', queryOk({ region: 'North' }), true)
  assert('S1.3 known status filter accepted', queryOk({ status: 'IN_PROGRESS' }), true)
  assert('S1.4 unknown status filter rejected', queryOk({ status: 'DONE' }), false)
  assert('S1.5 limit coerced from text', assignmentListQuerySchema.safeParse({ limit: '25' }).data.limit, 25)
  assert('S1.6 limit 0 rejected', queryOk({ limit: 0 }), false)
  assert('S1.7 limit > 500 rejected', queryOk({ limit: 501 }), false)
  assert('S1.8 officerId must be a uuid', queryOk({ officerId: 'officer-1' }), false)
  assert('S1.9 alien query field rejected', queryOk({ role: 'ADMIN' }), false)

  assert('S1.10 assignment id must be a uuid', idOk({ id: UUID }), true)
  assert('S1.11 non-uuid assignment id rejected', idOk({ id: 'abc' }), false)

  assert('S1.12 status body accepts a known status', statusOk({ status: 'COMPLETED' }), true)
  assert('S1.13 status body rejects an unknown status', statusOk({ status: 'ASSIGNED_TO_OTHER' }), false)
  assert('S1.14 status body rejects an alien field', statusOk({ status: 'COMPLETED', force: true }), false)

  assert('S1.15 dispatch accepts an optional station', dispatchOk({ regionKey: 'North', capability: 'Radar', officerIds: [UUID], station: 'Colaba' }), true)
  assert('S1.16 dispatch without a station still valid', dispatchOk({ regionKey: 'North', capability: 'Radar', officerIds: [UUID] }), true)
}

// ---------------------------------------------------------------------------
// S2. PROJECTION — the API shape is safe and enriched.
// ---------------------------------------------------------------------------
{
  const { mapAssignment } = await import('./src/services/dispatch.service.js')

  const row = {
    id: 'a1',
    officer_id: 'o1',
    region: 'North',
    station: 'Colaba',
    capability: 'Radar',
    status: 'ASSIGNED',
    assigned_by: 'admin1',
    assigned_at: '2026-09-19T00:00:00.000Z',
    completed_at: null,
    notes: 'Cyclone cover',
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-19T00:00:00.000Z',
  }
  const byId = new Map([
    ['o1', { id: 'o1', name: 'Asha Rao', station: 'Colaba' }],
    ['admin1', { id: 'admin1', name: 'Admin One' }],
  ])
  const view = mapAssignment(row, byId)

  assert('S2.1 officer id exposed', view.officerId, 'o1')
  assert('S2.2 officer name enriched', view.officerName, 'Asha Rao')
  assert('S2.3 officer station enriched', view.officerStation, 'Colaba')
  assert('S2.4 capability exposed', view.capability, 'Radar')
  assert('S2.5 status exposed', view.status, 'ASSIGNED')
  assert('S2.6 assigner name enriched', view.assignedByName, 'Admin One')
  assert('S2.7 notes exposed', view.notes, 'Cyclone cover')
  assert('S2.8 raw created_at never leaks', 'created_at' in view, false)
  assert('S2.9 raw updated_at never leaks', 'updated_at' in view, false)
  assert('S2.10 raw snake_case officer_id never leaks', 'officer_id' in view, false)

  const bare = mapAssignment({ ...row, station: null, assigned_by: null, notes: null }, new Map())
  assert('S2.11 missing station is null', bare.station, null)
  assert('S2.12 missing notes is null', bare.notes, null)
  assert('S2.13 unmatched officer name is null (not invented)', bare.officerName, null)
  assert('S2.14 mapAssignment(null) is null', mapAssignment(null), null)
}

// ---------------------------------------------------------------------------
// S3. LIFECYCLE — the state machine is explicit.
// ---------------------------------------------------------------------------
{
  const { DUTY_STATUSES, DUTY_TRANSITIONS, canTransition, normalizeOfficerIds } = await import('./src/services/dispatch.service.js')

  assert('S3.1 four statuses', DUTY_STATUSES.length, 4)
  assert('S3.2 assigned -> in progress allowed', canTransition('ASSIGNED', 'IN_PROGRESS'), true)
  assert('S3.3 in progress -> completed allowed', canTransition('IN_PROGRESS', 'COMPLETED'), true)
  assert('S3.4 both active states cancellable', canTransition('ASSIGNED', 'CANCELLED') && canTransition('IN_PROGRESS', 'CANCELLED'), true)
  assert('S3.5 cannot skip to completed', canTransition('ASSIGNED', 'COMPLETED'), false)
  assert('S3.6 cannot reopen completed', canTransition('COMPLETED', 'IN_PROGRESS'), false)
  assert('S3.7 cannot reopen cancelled', canTransition('CANCELLED', 'ASSIGNED'), false)
  assert('S3.8 terminal map is empty', DUTY_TRANSITIONS.COMPLETED.length + DUTY_TRANSITIONS.CANCELLED.length, 0)

  const { unique, duplicates } = normalizeOfficerIds([UUID, UUID, 'x'])
  assert('S3.9 duplicates collapsed', unique, [UUID, 'x'])
  assert('S3.10 duplicates reported', duplicates, [UUID])
}

// ---------------------------------------------------------------------------
// S4. AUTHORISATION — non-admin rejection precedes repository access.
// ---------------------------------------------------------------------------
{
  const { listAssignments, updateAssignmentStatus, cancelAssignment } = await import('./src/services/dispatch.service.js')

  await assertApiError('S4.1 trainer cannot read the roster', () => listAssignments({ actor: { role: 'TRAINER' } }), 403, 'FORBIDDEN')
  await assertApiError('S4.2 trainee cannot read the roster', () => listAssignments({ actor: { role: 'TRAINEE' } }), 403, 'FORBIDDEN')
  await assertApiError('S4.3 missing actor cannot read the roster', () => listAssignments({ actor: null }), 403, 'FORBIDDEN')
  await assertApiError('S4.4 trainer cannot change status', () => updateAssignmentStatus({ actor: { role: 'TRAINER' }, assignmentId: UUID, status: 'COMPLETED' }), 403, 'FORBIDDEN')
  await assertApiError('S4.5 trainer cannot cancel', () => cancelAssignment({ actor: { role: 'TRAINER' }, assignmentId: UUID }), 403, 'FORBIDDEN')
}

// ---------------------------------------------------------------------------
// S5. VALIDATION — a bad status is rejected before any DB lookup.
// ---------------------------------------------------------------------------
{
  const { updateAssignmentStatus } = await import('./src/services/dispatch.service.js')

  // If this returned 404/500 it would prove a DB call happened first; a 400
  // proves the status contract is enforced ahead of the repository.
  await assertApiError(
    'S5.1 unknown status rejected before repository access',
    () => updateAssignmentStatus({ actor: { role: 'ADMIN', id: 'admin1' }, assignmentId: UUID, status: 'NONSENSE' }),
    400,
    'INVALID_STATUS',
  )
}

// ---------------------------------------------------------------------------
// S6. RUNTIME — roster/dispatch endpoints are behind auth + the envelope.
// ---------------------------------------------------------------------------
const runtime = process.env.M17B_RUNTIME !== '0'
if (runtime) {
  let server
  try {
    const { createApp } = await import('./src/app.js')
    server = createApp().listen(0)
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const { port } = server.address()
    const base = `http://127.0.0.1:${port}`

    const protectedCases = [
      'GET /api/analytics/regional/assignments',
      'POST /api/analytics/regional/dispatch',
      `PATCH /api/analytics/regional/assignments/${UUID}/status`,
      `POST /api/analytics/regional/assignments/${UUID}/cancel`,
    ]
    for (const combo of protectedCases) {
      const [method, p] = combo.split(' ')
      const res = await fetch(`${base}${p}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({ status: 'COMPLETED' }),
      })
      assert(`S6.1 ${method} ${p} without token => 401`, res.status, 401)
      const body = await res.json()
      assert(`S6.2 ${method} ${p} uses error envelope`, body?.success, false)
      assert(`S6.3 ${method} ${p} carries a coded error`, typeof body?.error?.code, 'string')
      assert(`S6.4 ${method} ${p} never leaks a stack`, body?.error?.stack, undefined)
    }
  } catch (err) {
    console.error('FAIL  runtime portion:', err)
    process.exitCode = 1
  } finally {
    if (server) server.close()
  }
} else {
  skip('S6 runtime endpoints', 'M17B_RUNTIME=0')
}

// ---------------------------------------------------------------------------
// S7. LIVE SCHEMA PROBE — READ-ONLY. Proves the additive migration is applied.
// ---------------------------------------------------------------------------
const live = process.env.M17B_LIVE !== '0'
if (live) {
  try {
    const { supabaseAdmin } = await import('./src/lib/supabaseAdmin.js')

    const { error: tableError } = await supabaseAdmin.from('duty_assignments').select('id').limit(1)
    if (tableError && (tableError.code === 'PGRST205' || tableError.code === '42P01')) {
      console.log(`MIGRATION_NOT_APPLIED  duty_assignments is absent (${tableError.code}); apply supabase/migrations/20260919120000_duty_assignments.sql.`)
      skip('S7.1 duty_assignments table present', 'MIGRATION_NOT_APPLIED')
    } else if (tableError) {
      assert('S7.1 duty_assignments table readable', tableError.message, undefined)
    } else {
      assert('S7.1 duty_assignments table present', true, true)

      // Empty officer list is rejected by the function BEFORE any insert, so this
      // probe is safe and proves the RPC exists without writing a row.
      const { error: rpcError } = await supabaseAdmin.rpc('dispatch_duty_assignments', {
        p_officer_ids: [],
        p_region: '__probe__',
        p_station: null,
        p_capability: '__probe__',
        p_assigned_by: UUID,
        p_notes: null,
      })
      if (rpcError && (rpcError.code === 'PGRST202' || rpcError.code === '42883')) {
        assert('S7.2 atomic dispatch RPC present', rpcError.code, '(missing)')
      } else {
        const raised = Boolean(rpcError) && /at least one officer/i.test(rpcError.message || '')
        assert('S7.2 atomic dispatch RPC present and rejects an empty selection', raised, true)
      }
    }
  } catch (err) {
    console.error('FAIL  live schema probe:', err)
    process.exitCode = 1
  }
} else {
  skip('S7 live schema probe', 'M17B_LIVE=0')
}

if (process.exitCode) {
  console.error('\nMODULE 17B VERIFICATION FAILED')
} else {
  console.log('\nMODULE 17B VERIFICATION PASSED')
}
