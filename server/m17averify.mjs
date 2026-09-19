// MODULE 17A VERIFICATION — regional officer dispatch (requirement -> matching).
//
// Follows the m11/m12/m16/m17 pattern: a dependency-free Node script (Node >= 20,
// "type": module) that imports the exported pure helpers / validators / middleware
// and checks every critical Module 17A behaviour WITHOUT touching a database, then
// boots the real server and asserts anonymous 401 + error-envelope shapes on the
// new protected surfaces.
//
//   node server/m17averify.mjs
//
// Sections:
//   S1  dispatch validators  — strict region/capability/count/officer-id contracts.
//   S2  matching engine      — domainOverlap / computeOfficerMatch compute real,
//                              renormalised scores and never invent rating/availability.
//   S3  authorisation        — non-admin is rejected before any data access.
//   S4  state machine        — duty-assignment transitions + officer dedup.
//   S5  sanitisation         — dbMessage never leaks through the new module.
//   S6  runtime              — new endpoints reject anonymous callers 401 with the
//                              standard envelope.

const assert = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error(`FAIL  ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    process.exitCode = 1
  } else {
    console.log(`PASS  ${name}`)
  }
}

const assertApiError = async (name, fn, status, code) => {
  try {
    await fn()
    assert(`${name} (expected an ApiError)`, 'no throw', 'throw')
  } catch (err) {
    assert(`${name} status`, err?.status, status)
    assert(`${name} code`, err?.code, code)
  }
}

// ---------------------------------------------------------------------------
// S1. DISPATCH VALIDATORS
// ---------------------------------------------------------------------------
{
  const { officerMatchSchema, officerDispatchSchema } = await import('./src/validators/dispatch.validator.js')
  const matchOk = (v) => officerMatchSchema.safeParse(v).success
  const dispatchOk = (v) => officerDispatchSchema.safeParse(v).success
  const base = { regionKey: 'North', capability: 'Radar' }
  const OFFICER = '00000000-0000-4000-8000-000000000000'

  assert('S1.1 valid match request passes', matchOk(base), true)
  assert('S1.2 missing region rejected', matchOk({ capability: 'Radar' }), false)
  assert('S1.3 blank region rejected', matchOk({ ...base, regionKey: '   ' }), false)
  assert('S1.4 missing capability rejected', matchOk({ regionKey: 'North' }), false)
  assert('S1.5 blank capability rejected', matchOk({ ...base, capability: '  ' }), false)
  assert('S1.6 count 0 rejected', matchOk({ ...base, requiredCount: 0 }), false)
  assert('S1.7 count > 50 rejected', matchOk({ ...base, requiredCount: 51 }), false)
  assert('S1.8 alien field rejected', matchOk({ ...base, role: 'ADMIN' }), false)
  assert('S1.9 omitted count defaults to 1', officerMatchSchema.safeParse(base).data.requiredCount, 1)
  assert('S1.10 text count is coerced', officerMatchSchema.safeParse({ ...base, requiredCount: '3' }).data.requiredCount, 3)

  assert('S1.11 valid dispatch request passes', dispatchOk({ ...base, officerIds: [OFFICER] }), true)
  assert('S1.12 dispatch requires officer ids', dispatchOk(base), false)
  assert('S1.13 empty officer selection rejected', dispatchOk({ ...base, officerIds: [] }), false)
  assert('S1.14 non-uuid officer rejected', dispatchOk({ ...base, officerIds: ['officer-1'] }), false)
  assert('S1.15 alien field rejected on dispatch', dispatchOk({ ...base, officerIds: [OFFICER], userId: 'x' }), false)
  assert('S1.16 optional notes accepted', dispatchOk({ ...base, officerIds: [OFFICER], notes: 'Cyclone season cover' }), true)
}

// ---------------------------------------------------------------------------
// S2. MATCHING ENGINE — real signals only.
// ---------------------------------------------------------------------------
{
  const {
    MATCH_WEIGHTS,
    UNAVAILABLE_SIGNALS,
    DUTY_HISTORY_TARGET,
    normalizeToken,
    tokenizeCapability,
    domainOverlap,
    computeOfficerMatch,
  } = await import('./src/services/dispatch.service.js')

  assert('S2.1 weights carried from the established engine', MATCH_WEIGHTS, { domain: 0.4, feedback: 0.2, history: 0.1 })
  assert('S2.2 rating/availability reported unavailable', UNAVAILABLE_SIGNALS, ['rating', 'availability'])
  assert('S2.3 history target mirrors frontend', DUTY_HISTORY_TARGET, 5)
  assert('S2.4 normalizeToken trims + lowercases', normalizeToken('  Radar  '), 'radar')
  assert('S2.5 tokenizer splits technical names', tokenizeCapability('C-Band Radar'), ['c', 'band', 'radar'])

  const officer = { expertise: ['Radar Operations'], specializations: [], skills: [] }
  assert('S2.6 exact/contains overlap scores 1', domainOverlap(officer, 'Radar'), 1)
  assert('S2.7 partial overlap reports the real fraction', domainOverlap({ expertise: ['Radar'] }, 'Radar Nowcasting'), 0.5)
  assert('S2.8 no overlap is zero (not invented)', domainOverlap({ expertise: ['Hydrology'] }, 'Radar'), 0)
  assert('S2.9 empty profile is zero', domainOverlap({}, 'Radar'), 0)

  const domainOnly = computeOfficerMatch({ expertise: ['Radar'], feedbackAverage: null, dutyHistory: null }, 'Radar')
  assert('S2.10 domain-only score stays 100 (renormalised)', domainOnly.score, 100)
  assert('S2.11 missing feedback reported null', domainOnly.breakdown.feedback, null)
  assert('S2.12 missing history reported null', domainOnly.breakdown.history, null)
  assert('S2.13 unavailable list surfaced', domainOnly.unavailable, ['rating', 'availability'])

  const full = computeOfficerMatch({ expertise: ['Radar'], feedbackAverage: 5, dutyHistory: 10 }, 'Radar Nowcasting')
  assert('S2.14 real weighted score', full.score, 71)
  assert('S2.15 domain component', full.breakdown.domain, 50)
  assert('S2.16 feedback component', full.breakdown.feedback, 100)
  assert('S2.17 history component capped at 100', full.breakdown.history, 100)

  const poor = computeOfficerMatch({ expertise: ['Radar'], feedbackAverage: 1, dutyHistory: 0 }, 'Radar')
  assert('S2.18 worst real feedback/history lower the score', poor.score, 57)
  assert('S2.19 zero history kept as 0 not null', poor.breakdown.history, 0)

  const mid = computeOfficerMatch({ expertise: ['Radar'], feedbackAverage: 3.5, dutyHistory: 1 }, 'Radar')
  assert('S2.20 fractional feedback rounded', mid.breakdown.feedback, 63)
  assert('S2.21 partial history', mid.breakdown.history, 20)
}

// ---------------------------------------------------------------------------
// S3. AUTHORISATION — non-admin is rejected before any data access.
// ---------------------------------------------------------------------------
{
  const { findOfficerMatches, dispatchOfficers } = await import('./src/services/dispatch.service.js')
  const request = { regionKey: 'North', capability: 'Radar', requiredCount: 1 }

  await assertApiError(
    'S3.1 trainer cannot discover officers',
    () => findOfficerMatches({ actor: { role: 'TRAINER' }, ...request }),
    403,
    'FORBIDDEN',
  )
  await assertApiError(
    'S3.2 trainee cannot discover officers',
    () => findOfficerMatches({ actor: { role: 'TRAINEE' }, ...request }),
    403,
    'FORBIDDEN',
  )
  await assertApiError(
    'S3.3 missing actor cannot discover officers',
    () => findOfficerMatches({ actor: null, ...request }),
    403,
    'FORBIDDEN',
  )
  await assertApiError(
    'S3.4 trainer cannot dispatch',
    () => dispatchOfficers({ actor: { role: 'TRAINER' }, ...request, officerIds: ['00000000-0000-4000-8000-000000000000'] }),
    403,
    'FORBIDDEN',
  )
}

// ---------------------------------------------------------------------------
// S4. STATE MACHINE — status transitions are explicit and cannot be skipped.
// ---------------------------------------------------------------------------
{
  const {
    DUTY_STATUSES,
    ACTIVE_DUTY_STATUSES,
    DUTY_TRANSITIONS,
    canTransition,
    normalizeOfficerIds,
  } = await import('./src/services/dispatch.service.js')

  assert('S4.1 all statuses declared', DUTY_STATUSES, ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  assert('S4.2 active statuses are the two non-terminal ones', ACTIVE_DUTY_STATUSES, ['ASSIGNED', 'IN_PROGRESS'])
  assert('S4.3 assigned can start', canTransition('ASSIGNED', 'IN_PROGRESS'), true)
  assert('S4.4 assigned can be cancelled', canTransition('ASSIGNED', 'CANCELLED'), true)
  assert('S4.5 in-progress can complete', canTransition('IN_PROGRESS', 'COMPLETED'), true)
  assert('S4.6 in-progress can be cancelled', canTransition('IN_PROGRESS', 'CANCELLED'), true)
  assert('S4.7 completed is terminal', canTransition('COMPLETED', 'ASSIGNED'), false)
  assert('S4.8 cancelled is terminal', canTransition('CANCELLED', 'IN_PROGRESS'), false)
  assert('S4.9 skipping straight to completed is rejected', canTransition('ASSIGNED', 'COMPLETED'), false)
  assert('S4.10 no-op transition rejected', canTransition('ASSIGNED', 'ASSIGNED'), false)
  assert('S4.11 unknown status rejected', canTransition('NOPE', 'ASSIGNED'), false)
  assert(
    'S4.12 terminal states have no transitions',
    DUTY_TRANSITIONS.COMPLETED.length + DUTY_TRANSITIONS.CANCELLED.length,
    0,
  )

  const { unique, duplicates } = normalizeOfficerIds(['a', 'b', 'a', 'c', 'b', 'a'])
  assert('S4.13 de-duplicates preserving first-seen order', unique, ['a', 'b', 'c'])
  assert('S4.14 duplicate ids reported', duplicates, ['a', 'b', 'a'])
  assert('S4.15 non-array is empty', normalizeOfficerIds(null).unique, [])
}

// ---------------------------------------------------------------------------
// S5. SANITISATION — the new module never leaks database text.
// ---------------------------------------------------------------------------
{
  const { errorHandler } = await import('./src/middleware/errorHandler.js')
  const { ApiError } = await import('./src/utils/apiResponse.js')

  let captured
  const res = {
    status: (s) => ({
      json: (body) => {
        captured = { status: s, body }
      },
    }),
  }
  errorHandler(
    new ApiError(409, 'DUTY_ASSIGNMENT_CONFLICT', 'That officer already holds this duty.', {
      dbCode: '23505',
      dbMessage: 'duplicate key value violates unique constraint "uniq_duty_assignments_active"',
    }),
    { method: 'POST', originalUrl: '/api/analytics/regional/dispatch' },
    res,
    () => {},
  )
  assert('S5.1 conflict status preserved', captured.status, 409)
  assert('S5.2 coded error surfaced', captured.body.error.code, 'DUTY_ASSIGNMENT_CONFLICT')
  assert('S5.3 dbMessage stripped', captured.body.error.details.dbMessage, undefined)
  assert('S5.4 opaque dbCode kept for diagnosis', captured.body.error.details.dbCode, '23505')
  assert('S5.5 human message survives for the UI', captured.body.error.message, 'That officer already holds this duty.')
}

// ---------------------------------------------------------------------------
// S6. RUNTIME — new endpoints are registered behind the envelope + auth.
// ---------------------------------------------------------------------------
const runtime = process.env.M17A_RUNTIME !== '0'
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
      'POST /api/analytics/regional/officer-matches',
      'POST /api/analytics/regional/dispatch',
      'GET /api/analytics/regional/assignments',
      'PATCH /api/analytics/regional/assignments/00000000-0000-4000-8000-000000000000/status',
      'POST /api/analytics/regional/assignments/00000000-0000-4000-8000-000000000000/cancel',
    ]
    for (const combo of protectedCases) {
      const [method, p] = combo.split(' ')
      const res = await fetch(`${base}${p}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({ regionKey: 'North', capability: 'Radar' }),
      })
      assert(`S6.1 ${method} ${p} without token => 401`, res.status, 401)
      const body = await res.json()
      assert(`S6.2 ${method} ${p} uses error envelope`, body?.success, false)
      assert(`S6.3 ${method} ${p} carries a coded error`, typeof body?.error?.code, 'string')
      assert(`S6.4 ${method} ${p} never leaks a stack`, body?.error?.stack, undefined)
    }

    // Auth precedes validation: a malformed body still fails identity first.
    const malformed = await fetch(`${base}/api/analytics/regional/officer-matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonsense: true }),
    })
    assert('S6.5 malformed body still 401 (auth precedes validation)', malformed.status, 401)

    const health = await fetch(`${base}/api/health`)
    assert('S6.6 health still 200', health.status, 200)

    const missing = await fetch(`${base}/api/analytics/regional/does-not-exist`)
    assert('S6.7 unknown regional route 404', missing.status, 404)
  } catch (err) {
    console.error('FAIL  runtime portion:', err)
    process.exitCode = 1
  } finally {
    if (server) server.close()
  }
}

if (process.exitCode) {
  console.error('\nMODULE 17A VERIFICATION FAILED')
} else {
  console.log('\nMODULE 17A VERIFICATION PASSED')
}
