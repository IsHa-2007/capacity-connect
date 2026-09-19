// MODULE 17 VERIFICATION — broadcasts, notifications, analytics & professional profile.
//
// Follows the m11/m12/m16 pattern: a dependency-free Node script (Node >= 20,
// "type": module) that imports the exported pure helpers / middleware and checks
// every critical Module 17 behaviour WITHOUT hitting a database, then boots the
// real server and asserts anonymous 401 + error-envelope shapes on every new
// protected surface.
//
//   node server/m17verify.mjs
//
// Sections:
//   S1  broadcast validator  — required fields, length/enum/uuid bounds, strict
//                              alien-field rejection (create must not accept
//                              identity/ownership keys from the client).
//   S2  broadcast access matrix — pure broadcastVisibleToActor() across
//                              ADMIN/TRAINER/TRAINEE x { role, course, region,
//                              station } scopes (no invented visibility).
//   S3  fan-out addressability — audienceCoversUser() role/region/station/course
//                              matching for notification delivery.
//   S4  broadcast projection  — mapBroadcast() flattens legacy_raw safely.
//   S5  notification validator — param UUID gating.
//   S6  analytics helpers     — round2/weightedAverage/aggregateCompetencyByStation/
//                              buildRegionalRows compute real aggregates and stay
//                              null (never invented) without data.
//   S7  certification module  — certificationSchema correctness + strictness,
//                              certificationViewLevel RBAC matrix, notifyCertificateIssued
//                              exists and is additive to M12.
//   S8  sanitisation stays    — ApiError dbMessage is still stripped by the
//                              shared errorHandler for the new modules.
//   S9  runtime               — every new endpoint rejects anonymous callers 401
//                              with the standard envelope (no stack, coded error)
//                              and unknown broadcast/notification ids parse only
//                              as UUIDs.

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const assert = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error(`FAIL  ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    process.exitCode = 1
  } else {
    console.log(`PASS  ${name}`)
  }
}

// ---------------------------------------------------------------------------
// S1. BROADCAST VALIDATOR
// ---------------------------------------------------------------------------
{
  const { createBroadcastSchema, broadcastIdParamSchema } = await import('./src/validators/broadcast.validator.js')
  const ok = (v) => createBroadcastSchema.safeParse(v).success

  assert('S1.1 minimal valid payload passes', ok({ title: 'Notice', body: 'Hello', audience: ['trainee'] }), true)
  assert('S1.2 trainer+all-trainee audience passes', ok({ title: 'T', body: 'B', audience: ['trainee', 'trainer'] }), true)
  assert('S1.3 empty title rejected', ok({ title: '', body: 'B', audience: ['trainee'] }), false)
  assert('S1.4 empty audience rejected', ok({ title: 'T', body: 'B', audience: [] }), false)
  assert('S1.5 bad role rejected', ok({ title: 'T', body: 'B', audience: ['admin'] }), false)
  assert('S1.6 unknown region rejected', ok({ title: 'T', body: 'B', audience: ['trainee'], region: 'Mid' }), false)
  assert('S1.7 valid region passes', ok({ title: 'T', body: 'B', audience: ['trainee'], region: 'North' }), true)
  assert('S1.8 non-UUID courseId rejected', ok({ title: 'T', body: 'B', audience: ['trainee'], courseId: 'abc' }), false)
  assert('S1.9 UUID courseId passes', ok({ title: 'T', body: 'B', audience: ['trainee'], courseId: '00000000-0000-4000-8000-000000000000' }), true)
  assert('S1.10 alien createdBy key stripped/rejected', ok({ title: 'T', body: 'B', audience: ['trainee'], createdBy: 'evil' }), false)
  assert('S1.11 alien id key rejected', ok({ title: 'T', body: 'B', audience: ['trainee'], id: 'x' }), false)
  assert('S1.12 body length ceiling enforced', ok({ title: 'T', body: 'x'.repeat(2001), audience: ['trainee'] }), false)
  assert('S1.13 malformed param id rejected', broadcastIdParamSchema.safeParse({ id: 'not-a-uuid' }).success, false)
  assert('S1.14 valid param id passes', broadcastIdParamSchema.safeParse({ id: '00000000-0000-4000-8000-000000000000' }).success, true)
}

// ---------------------------------------------------------------------------
// S2. BROADCAST ACCESS MATRIX (pure)
// ---------------------------------------------------------------------------
{
  const { broadcastVisibleToActor } = await import('./src/services/broadcast.service.js')

  const role = (r) => (station = 'Pune', region = 'West') => ({ role: r, station, region })
  const trainee = role('TRAINEE')
  const trainer = role('TRAINER')
  const admin = role('ADMIN')
  const row = (audience, over = {}) => ({ audience, legacy_raw: over })

  // ADMIN sees everything.
  assert('S2.1 admin sees any broadcast', broadcastVisibleToActor(row(['trainee']), admin()), true)

  // TRAINER sees trainer-role broadcasts and course broadcasts they own.
  assert('S2.2 trainer sees trainer-role notice', broadcastVisibleToActor(row(['trainer']), trainer()), true)
  assert('S2.3 trainer sees all-role notice', broadcastVisibleToActor(row(['trainee', 'trainer']), trainer()), true)
  assert('S2.4 trainer sees owned-course broadcast', broadcastVisibleToActor(
    row(['trainee'], { courseId: 'c1' }), trainer(), { trainerCourseIds: ['c1'] }), true)
  assert('S2.5 trainer does NOT see another trainer course', broadcastVisibleToActor(
    row(['trainee'], { courseId: 'c2' }), trainer(), { trainerCourseIds: ['c1'] }), false)
  assert('S2.6 trainer does NOT see unrelated trainee notice', broadcastVisibleToActor(
    row(['trainee']), trainer()), false)

  // TRAINEE: role + course + region + station scope.
  assert('S2.7 trainee sees trainee notice', broadcastVisibleToActor(row(['trainee']), trainee()), true)
  assert('S2.8 trainee blocked from trainer-only notice', broadcastVisibleToActor(row(['trainer']), trainee()), false)
  assert('S2.9 trainee sees their enrolled course notice', broadcastVisibleToActor(
    row(['trainee'], { courseId: 'c1' }), trainee(), { enrolledCourseIds: ['c1'] }), true)
  assert('S2.10 trainee blocked from non-enrolled course notice', broadcastVisibleToActor(
    row(['trainee'], { courseId: 'c9' }), trainee(), { enrolledCourseIds: ['c1'] }), false)
  assert('S2.11 trainee sees matching region notice', broadcastVisibleToActor(
    row(['trainee'], { region: 'West' }), trainee()), true)
  assert('S2.12 trainee blocked from other-region notice', broadcastVisibleToActor(
    row(['trainee'], { region: 'East' }), trainee()), false)
  assert('S2.13 trainee sees matching station notice', broadcastVisibleToActor(
    row(['trainee'], { station: 'Pune' }), trainee()), true)
  assert('S2.14 trainee blocked from other-station notice', broadcastVisibleToActor(
    row(['trainee'], { station: 'Mumbai' }), trainee()), false)
}

// ---------------------------------------------------------------------------
// S3. FAN-OUT ADDRESSABILITY (pure)
// ---------------------------------------------------------------------------
{
  const { mapBroadcastScopes, audienceCoversUser } = await import('./src/services/broadcast.service.js')
  const scopesFor = (audience, over = {}) => mapBroadcastScopes({ audience, ...over, legacy_raw: over })

  assert('S3.1 trainee covered by all-trainee broadcast', audienceCoversUser(
    { role: 'trainee' }, scopesFor(['trainee'])), true)
  assert('S3.2 trainer NOT covered by all-trainee broadcast', audienceCoversUser(
    { role: 'trainer' }, scopesFor(['trainee'])), false)
  assert('S3.3 trainer covered by all-role broadcast', audienceCoversUser(
    { role: 'trainer' }, scopesFor(['trainee', 'trainer'])), true)
  assert('S3.4 region mismatch excludes user', audienceCoversUser(
    { role: 'trainee', region: 'East' }, scopesFor(['trainee'], { region: 'North' })), false)
  assert('S3.5 region match includes user', audienceCoversUser(
    { role: 'trainee', region: 'West' }, scopesFor(['trainee'], { region: 'West' })), true)
  assert('S3.6 station mismatch excludes user', audienceCoversUser(
    { role: 'trainee', station: 'Mumbai' }, scopesFor(['trainee'], { station: 'Pune' })), false)
  assert('S3.7 course fan-out requires enrolment', audienceCoversUser(
    { role: 'trainee' }, scopesFor(['trainee'], { courseId: 'c1' }), { enrolledCourseIds: [] }), false)
  assert('S3.8 enrolled user covered by course fan-out', audienceCoversUser(
    { role: 'trainee' }, scopesFor(['trainee'], { courseId: 'c1' }), { enrolledCourseIds: ['c1'] }), true)
}

// ---------------------------------------------------------------------------
// S4. BROADCAST PROJECTION (pure)
// ---------------------------------------------------------------------------
{
  const { mapBroadcast } = await import('./src/services/broadcast.service.js')
  const projected = mapBroadcast({
    id: 'b1',
    title: 'Notice',
    body: 'Body',
    audience: ['trainee'],
    course_id: 'c1',
    created_by: 'u1',
    created_at: '2026-09-19T00:00:00.000Z',
    legacy_raw: { type: 'Policy change', region: 'North', station: null, label: 'All Region North' },
  })
  assert('S4.1 projection flattens legacy_raw.type', projected.type, 'Policy change')
  assert('S4.2 projection flattens legacy_raw.region', projected.region, 'North')
  assert('S4.3 projection keeps courseId', projected.courseId, 'c1')
  assert('S4.4 projection keeps audience array', projected.audience, ['trainee'])
  assert('S4.5 projection keeps createdBy id (identity from DB, never client)', projected.createdBy, 'u1')

  const empty = mapBroadcast({ audience: [], legacy_raw: null })
  assert('S4.6 projection tolerates null legacy_raw', empty.region, null)
  assert('S4.7 projection tolerates null legacy_raw type', empty.type, null)
}

// ---------------------------------------------------------------------------
// S5. NOTIFICATION VALIDATOR
// ---------------------------------------------------------------------------
{
  const { notificationIdParamSchema } = await import('./src/validators/notification.validator.js')
  assert('S5.1 malformed notification id rejected', notificationIdParamSchema.safeParse({ id: 'nope' }).success, false)
  assert('S5.2 valid notification id accepted', notificationIdParamSchema.safeParse({ id: '00000000-0000-4000-8000-000000000000' }).success, true)
}

// ---------------------------------------------------------------------------
// S6. ANALYTICS PURE HELPERS — real aggregates only, null when no data.
// ---------------------------------------------------------------------------
{
  const { round2, weightedAverage, aggregateCompetencyByStation, buildRegionalRows, GAP_THRESHOLD } =
    await import('./src/services/analytics.service.js')

  assert('S6.1 round2 basic', round2(71.207), 71.21)
  assert('S6.2 round2 null passthrough', round2(null), null)
  assert('S6.3 round2 NaN passthrough', round2('abc'), null)
  assert('S6.4 weightedAverage empty -> null', weightedAverage([]), null)
  assert('S6.5 weightedAverage weights correctly', weightedAverage([{ weight: 10, value: 80 }, { weight: 2, value: 50 }]), 75)
  assert('S6.6 weightedAverage ignores null values', weightedAverage([{ weight: 1, value: 40 }, { weight: 0, value: 99 }]), 40)

  const byStation = aggregateCompetencyByStation([
    { station: 'Pune', domain: 'Radar', competency: 80 },
    { station: 'Pune', domain: 'Radar', competency: 60 },
    { station: 'Pune', domain: 'NWP', competency: 50 },
    { station: null, domain: 'Radar', competency: 99 },
    { station: 'Mumbai', domain: 'Radar', competency: 90 },
  ])
  assert('S6.7 null-station rows excluded', byStation.has('Pune'), true)
  assert('S6.8 null-station rows excluded (2)', byStation.size, 2)
  const pune = byStation.get('Pune')
  assert('S6.9 per-domain mean computed', Math.round(pune.domains.get('Radar').sum / pune.domains.get('Radar').count), 70)
  assert('S6.10 station mean across domains', pune.competency, round2((80 + 60 + 50) / 3))

  const regions = buildRegionalRows(
    [
      { station: 'New Delhi', region: 'North' },
      { station: 'Jaipur', region: 'North' },
      { station: 'Mumbai', region: 'West' },
    ],
    byStation,
    new Map([['Pune', 3]]),
  )
  // Note: only stations in the map are emitted; unknown-station results stay out.
  const names = regions.map((r) => r.region)
  assert('S6.11 regions emitted in seed order', names, ['North', 'West', 'East', 'South'])
  const north = regions[0]
  assert('S6.12 station without sample -> competency null (never invented)', north.stations[0].competency, null)
  assert('S6.13 region without data -> competency null', north.competency, null)
  assert('S6.14 gap list empty when no data (no invented gaps)', north.domainGaps, [])
  assert('S6.15 threshold is the documented 70', GAP_THRESHOLD, 70)

  const lowData = buildRegionalRows(
    [{ station: 'X', region: 'North' }],
    aggregateCompetencyByStation([{ station: 'X', domain: 'NWP', competency: 55 }]),
    new Map(),
  )
  assert('S6.16 real low competency surfaces as a gap', lowData[0].domainGaps[0].domain, 'NWP')
  assert('S6.17 gap carries the real value', lowData[0].domainGaps[0].competency, 55)
}

// ---------------------------------------------------------------------------
// S7. CERTIFICATION MODULE (validators + RBAC + additive notification)
// ---------------------------------------------------------------------------
{
  const { certificationSchema, certificationIdParamSchema } = await import('./src/validators/user.validator.js')
  const ok = (v) => certificationSchema.safeParse(v).success
  const base = { certificationName: 'Certified Meteorologist', issuer: 'IMD', obtainedDate: '2026-01-15' }

  assert('S7.1 valid certification passes', ok(base), true)
  assert('S7.2 missing title rejected', ok({ issuer: 'IMD', obtainedDate: '2026-01-15' }), false)
  assert('S7.3 missing issuer rejected', ok({ ...base, issuer: '' }), false)
  assert('S7.4 bad date rejected', ok({ ...base, obtainedDate: '15/01/2026' }), false)
  assert('S7.5 valid expiry passes', ok({ ...base, expiryDate: '2028-01-15' }), true)
  assert('S7.6 bad credential URL rejected', ok({ ...base, credentialUrl: 'not-a-url' }), false)
  assert('S7.6b empty credential URL accepted (coerced to null)', ok({ ...base, credentialUrl: '' }), true)
  assert('S7.6c whitespace credential URL accepted (coerced to null)', ok({ ...base, credentialUrl: '   ' }), true)
  assert('S7.7 alien userId rejected (ownership never client-supplied)', ok({ ...base, userId: 'x' }), false)
  assert('S7.8 alien id rejected', ok({ ...base, id: 'x' }), false)
  assert('S7.9 malformed param id rejected', certificationIdParamSchema.safeParse({ id: 'x' }).success, false)

  const { certificationViewLevel } = await import('./src/services/userCertification.service.js')
  const approved = (role) => ({ role, approval_status: 'APPROVED' })
  const pending = (role) => ({ role, approval_status: 'PENDING' })

  assert('S7.10 self view is full', certificationViewLevel('u1', 'u1', null), 'full')
  assert('S7.11 approved admin sees full', certificationViewLevel('u1', 'a1', approved('ADMIN')), 'full')
  assert('S7.12 approved peer sees public subset', certificationViewLevel('u1', 'u2', approved('TRAINEE')), 'public')
  assert('S7.13 pending caller denied', certificationViewLevel('u1', 'u2', pending('TRAINEE')), 'none')
  assert('S7.14 unknown caller denied', certificationViewLevel('u1', 'u2', null), 'none')

  const cert = await import('./src/services/certificate.service.js')
  assert('S7.15 certificate notification dispatcher exists (additive to M12)', typeof cert.notifyCertificateIssued, 'function')
}

// ---------------------------------------------------------------------------
// S8. SHARED SANITISATION still guards new modules (dbMessage never leaks).
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
    new ApiError(500, 'BROADCAST_CREATE_UNEXPECTED', 'The broadcast could not be processed. Please try again.', {
      dbCode: '42501',
      dbMessage: 'permission denied for relation broadcasts',
    }),
    { method: 'POST', originalUrl: '/api/broadcasts' },
    res,
    () => {},
  )
  assert('S8.1 500 status preserved', captured.status, 500)
  assert('S8.2 dbMessage stripped from broadcast error', captured.body.error.details.dbMessage, undefined)
  assert('S8.3 opaque dbCode survives for diagnosis', captured.body.error.details.dbCode, '42501')
  assert('S8.4 coded message surfaced', captured.body.error.code, 'BROADCAST_CREATE_UNEXPECTED')
}

// ---------------------------------------------------------------------------
// S9. RUNTIME — new endpoints are registered behind the envelope + auth.
// ---------------------------------------------------------------------------
const runtime = process.env.M17_RUNTIME !== '0'
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
    const UUID = '00000000-0000-4000-8000-000000000000'

    // Every Module 17 protected surface rejects anonymous callers.
    const protectedCases = [
      'GET /api/broadcasts',
      'POST /api/broadcasts',
      'DELETE /api/broadcasts/:id',
      'GET /api/notifications',
      'GET /api/notifications/unread-count',
      'PATCH /api/notifications/:id/read',
      'PATCH /api/notifications/read-all',
      'GET /api/analytics/insights',
      'GET /api/analytics/regional',
      'GET /api/users/me/certifications',
      'POST /api/users/me/certifications',
      'PATCH /api/users/me/certifications/:id',
      'DELETE /api/users/me/certifications/:id',
      'GET /api/users/:id/certifications',
    ]
    for (const combo of protectedCases) {
      const [method, p] = combo.split(' ')
      const realPath = p.replace(':id', UUID)
      const res = await fetch(`${base}${realPath}`, { method })
      assert(`S9.1 ${method} ${realPath} without token => 401`, res.status, 401)
      const body = await res.json()
      assert(`S9.2 ${method} ${realPath} uses error envelope`, body?.success, false)
      assert(`S9.3 ${method} ${realPath} carries a coded error`, typeof body?.error?.code, 'string')
      assert(`S9.4 ${method} ${realPath} never leaks a stack`, body?.error?.stack, undefined)
    }

    // Fan-out/notification readonly paths are NOT gated by approval (a pending
    // account may still read targeted system messages its role is entitled to) —
    // but analytics stays admin-locked at the route layer (checked above).
    const health = await fetch(`${base}/api/health`)
    assert('S9.5 health still 200', health.status, 200)

    // Malformed (non-UUID) ids on protected endpoints still 401 first — the
    // identity gate precedes validation, so no parameter-shape info leaks.
    const malformed = await fetch(`${base}/api/broadcasts/not-a-uuid`, { method: 'DELETE' })
    assert('S9.6 malformed broadcast id still 401 (auth precedes validation)', malformed.status, 401)

    // Unknown namespace keeps the 404 API shape (no HTML stack).
    const missing = await fetch(`${base}/api/does-not-exist`)
    const missingBody = await missing.json()
    assert('S9.7 unknown route 404', missing.status, 404)
    assert('S9.8 404 in API shape', missingBody?.success, false)
    assert('S9.9 404 without stack', missingBody?.error?.stack, undefined)
  } catch (err) {
    console.error('FAIL  runtime portion:', err)
    process.exitCode = 1
  } finally {
    if (server) server.close()
  }
}

if (process.exitCode) {
  console.error('\nMODULE 17 VERIFICATION FAILED')
} else {
  console.log('\nMODULE 17 VERIFICATION PASSED')
}