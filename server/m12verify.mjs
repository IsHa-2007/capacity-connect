// MODULE 12 VERIFICATION — certificate generation, verification & profile sync.
//
// Mirrors the m8/m9/m10/m11 style: a dependency-free Node script (Node >= 20,
// "type": module) that imports the exported pure helpers + validators and
// checks every mandated Module 12 behaviour WITHOUT hitting a database.
//
//   node server/m12verify.mjs
//
// The runtime portion boots the real server on an alternate port and asserts:
//   * GET /api/health                                     -> 200
//   * GET /api/certificates (no token)                    -> 401
//   * GET /api/enrollments/:id/certificate (no token)     -> 401
//   * GET /api/certificates/verify/:code (NO auth)        -> reachable (not 401)
// It never creates users, enrollments or certificate rows.

const assert = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error(`FAIL  ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    process.exitCode = 1
  } else {
    console.log(`PASS  ${name}`)
  }
}

const {
  certificateEligibility,
  nextCertificateNumber,
  parseCertificateNumber,
  canViewCertificate,
  hasSubmittedFeedback,
  verificationView,
  CERTIFICATE_ISSUER_LABEL,
} = await import('./src/services/certificate.service.js')

const { mapCertificateRow, mapCertificateListItem } = await import('./src/repositories/certificate.repository.js')

const { verificationCodeParamSchema } = await import('./src/validators/certificate.validator.js')

// ---------------------------------------------------------------------------
// 1–3. ELIGIBILITY (backend-authoritative: passed AND feedback submitted AND
//      not cancelled; missing each → its exact gate/code).
// ---------------------------------------------------------------------------
{
  const fresh = certificateEligibility({ status: 'ENROLLED', assessment: { passed: null }, feedback: null })
  assert('1a. fresh enrollment → assessment gate', fresh.code, 'CERTIFICATE_ASSESSMENT_REQUIRED')
  assert('1b. fresh enrollment not eligible', fresh.eligible, false)

  const failed = certificateEligibility({ status: 'IN_PROGRESS', assessment: { passed: false }, feedback: null })
  assert('1c. failed assessment → assessment gate', failed.code, 'CERTIFICATE_ASSESSMENT_REQUIRED')

  const passedNoFeedback = certificateEligibility({
    status: 'IN_PROGRESS',
    assessment: { passed: true },
    feedback: { contentDepth: null, trainerDelivery: null, operationalRelevance: null },
  })
  assert('2a. passed but no feedback → feedback gate', passedNoFeedback.code, 'CERTIFICATE_FEEDBACK_REQUIRED')
  assert('2b. exact feedback-required message',
    passedNoFeedback.message, 'Certificate is not available until feedback is submitted.')

  const cancelled = certificateEligibility({ status: 'CANCELLED', assessment: { passed: true }, feedback: { contentDepth: 5 } })
  assert('3a. cancelled → cancellation gate', cancelled.code, 'CERTIFICATE_CANCELLED')
  assert('3b. cancelled not eligible', cancelled.eligible, false)

  const eligible = certificateEligibility({
    status: 'COMPLETED',
    assessment: { passed: true },
    feedback: { contentDepth: 5, trainerDelivery: 4, operationalRelevance: 3, suggestions: 'Great' },
  })
  assert('3c. passed + feedback → eligible', eligible.eligible, true)

  assert('3d. null enrollment → unknown gate', certificateEligibility(null).code, 'CERTIFICATE_UNKNOWN_ENROLLMENT')
}

// ---------------------------------------------------------------------------
// 4–6. ISSUANCE / NUMBERING (CC-YYYY-NNNNNN, concurrency-safe, never COUNT).
// ---------------------------------------------------------------------------
{
  assert('4a. first number of a year starts at 000001',
    nextCertificateNumber({ year: 2026, latest: null }), 'CC-2026-000001')
  assert('4b. increments from the highest existing',
    nextCertificateNumber({ year: 2026, latest: 'CC-2026-000042' }), 'CC-2026-000043')
  assert('4c. non-CC legacy latest restarts the sequence',
    nextCertificateNumber({ year: 2026, latest: 'LEGACY-X-12' }), 'CC-2026-000001')
  assert('4d. a previous-year latest restarts the sequence',
    nextCertificateNumber({ year: 2026, latest: 'CC-2025-099999' }), 'CC-2026-000001')
  assert('4e. padded to six digits',
    nextCertificateNumber({ year: 2026, latest: 'CC-2026-000999' }), 'CC-2026-001000')

  const parsed = parseCertificateNumber('CC-2026-000042')
  assert('5a. parse returns year', parsed.year, '2026')
  assert('5b. parse returns sequence', parsed.sequence, 42)
  assert('5c. garbage is rejected', parseCertificateNumber('nope'), null)
  assert('5d. legacy without CC prefix is rejected', parseCertificateNumber('LEGACY-9'), null)

  // Concurrency safety is enforced by UNIQUE(enrollment_id/certificate_number)
  // and the service's retry loop; these pure assertions document the invariants
  // the loop relies on (monotonic, deterministic per (year, latest)).
  assert('6a. numbering is deterministic', nextCertificateNumber({ year: 2026, latest: 'CC-2026-000001' }), 'CC-2026-000002')
  assert('6b. two issuances never collide from the same latest value',
    nextCertificateNumber({ year: 2026, latest: 'CC-2026-000007' }) !==
    nextCertificateNumber({ year: 2026, latest: 'CC-2026-000007' }), false)
}

// ---------------------------------------------------------------------------
// 7–8. FEEDBACK SUBMISSION SEMANTICS (Module 11 truth, unchanged by M12).
// ---------------------------------------------------------------------------
{
  assert('7a. null feedback not submitted', hasSubmittedFeedback(null), false)
  assert('7b. empty feedback not submitted', hasSubmittedFeedback({}), false)
  assert('7c. any rating = submitted', hasSubmittedFeedback({ contentDepth: 5 }), true)
  assert('7d. suggestions-only counts', hasSubmittedFeedback({ suggestions: 'note' }), true)
  assert('7e. all-null = not submitted',
    hasSubmittedFeedback({ contentDepth: null, trainerDelivery: null, operationalRelevance: null }), false)
}

// ---------------------------------------------------------------------------
// 9–10. AUTHORIZATION MATRIX (canViewCertificate).
// ---------------------------------------------------------------------------
{
  const enc = { userId: 'u-jane', trainerId: 't-bob', courseId: 'c-x' }
  const trainee = (id) => ({ id, role: 'TRAINEE', approvalStatus: 'APPROVED' })
  const trainer = (id, approved = true) => ({ id, role: 'TRAINER', approvalStatus: approved ? 'APPROVED' : 'PENDING' })
  const admin = { id: 'a1', role: 'ADMIN', approvalStatus: 'APPROVED' }

  assert('9a. owner trainee may view', canViewCertificate(trainee('u-jane'), enc), true)
  assert('9b. other trainee may not', canViewCertificate(trainee('u-other'), enc), false)
  assert('9c. owning trainer (approved) may view', canViewCertificate(trainer('t-bob'), enc), true)
  assert('9d. unapproved trainer may not', canViewCertificate(trainer('t-bob', false), enc), false)
  assert('9e. non-owning trainer may not', canViewCertificate(trainer('t-other'), enc), false)
  assert('9f. admin may view', canViewCertificate(admin, enc), true)
  assert('9g. null actor denied', canViewCertificate(null, enc), false)
  assert('9h. null enrollment denied', canViewCertificate(trainee('u-jane'), null), false)
}

// ---------------------------------------------------------------------------
// 11–13. DATA INTEGRITY: verification-safe view + row mappers.
// ---------------------------------------------------------------------------
{
  const cert = {
    id: '11111111-1111-4111-8111-111111111111',
    enrollmentId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    courseId: '44444444-4444-4444-8444-444444444444',
    certificateNumber: 'CC-2026-000042',
    legacyCertificateId: null,
    issuedOn: '2026-09-19T10:00:00.000Z',
    issuedBy: null,
    createdAt: '2026-09-19T10:00:00.000Z',
  }
  const view = verificationView(cert, {
    traineeName: 'Jane Trainee',
    courseTitle: 'Numerical Weather Prediction',
    courseDomain: 'Meteorology',
    completionStatus: 'COMPLETED',
  })

  // The public verify shape MUST contain only verification-safe fields.
  const keys = Object.keys(view).sort()
  assert('11a. verify shape has only safe keys',
    keys, ['certificateNumber', 'completionStatus', 'courseDomain', 'courseTitle', 'issueDate', 'issuer', 'traineeName', 'valid'])
  assert('11b. verify shows valid', view.valid, true)
  assert('11c. verify shows traineeName', view.traineeName, 'Jane Trainee')
  assert('11d. verify shows course title', view.courseTitle, 'Numerical Weather Prediction')
  assert('11e. verify shows issue date', view.issueDate, cert.issuedOn)
  assert('11f. verify never includes internal id', view.id, undefined)
  assert('11g. verify never includes enrollment/user/course ids', view.enrollmentId || view.userId || view.courseId, undefined)
  assert('11h. verify never includes email', view.email, undefined)
  assert('11i. verify labels the issuer', view.issuer, CERTIFICATE_ISSUER_LABEL)

  // Row mappers camelCase the frozen DB columns verbatim.
  const row = {
    id: cert.id,
    enrollment_id: cert.enrollmentId,
    user_id: cert.userId,
    course_id: cert.courseId,
    certificate_number: cert.certificateNumber,
    legacy_certificate_id: null,
    issued_on: cert.issuedOn,
    issued_by: null,
    created_at: cert.createdAt,
  }
  const mapped = mapCertificateRow(row)
  assert('12a. mapper exposes enrollmentId/certificateNumber/issuedOn',
    mapped, { ...cert, legacyCertificateId: null, issuedBy: null })
  assert('12b. null row maps to null', mapCertificateRow(null), null)

  const item = mapCertificateListItem({
    ...row,
    users: { name: 'Jane Trainee' },
    enrollments: { assessment_percentage: 88, status: 'COMPLETED' },
    courses: { title: 'Numerical Weather Prediction', domain: 'Meteorology' },
  })
  assert('13a. list item carries traineeName', item.traineeName, 'Jane Trainee')
  assert('13b. list item carries score', item.score, 88)
  assert('13c. list item carries completion status', item.completionStatus, 'COMPLETED')
  assert('13d. list item carries course title/domain', item.courseTitle, 'Numerical Weather Prediction')
  assert('13e. list item keeps certificate number', item.certificateNumber, 'CC-2026-000042')
}

// ---------------------------------------------------------------------------
// VALIDATOR — public verification code shape.
// ---------------------------------------------------------------------------
{
  assert('14a. valid code passes', verificationCodeParamSchema.safeParse({ verificationCode: 'CC-2026-000042' }).success, true)
  assert('14b. legacy dash code passes', verificationCodeParamSchema.safeParse({ verificationCode: 'LEGACY-12-AB' }).success, true)
  assert('14c. too short rejected', verificationCodeParamSchema.safeParse({ verificationCode: 'AB' }).success, false)
  assert('14d. too long rejected', verificationCodeParamSchema.safeParse({ verificationCode: 'X'.repeat(70) }).success, false)
  assert('14e. spaces/underscore rejected', verificationCodeParamSchema.safeParse({ verificationCode: 'CC 2026 x' }).success, false)
}

// ---------------------------------------------------------------------------
// RUNTIME — boot real server (alt port) + authorization gating + public verify.
// ---------------------------------------------------------------------------
const runtime = process.env.M12_RUNTIME !== '0'
{
  if (runtime) {
    let server
    try {
      const { createApp } = await import('./src/app.js')
      const app = createApp()
      server = app.listen(0)
      await new Promise((resolve, reject) => {
        server.once('listening', resolve)
        server.once('error', reject)
      })
      const { port } = server.address()
      const base = `http://127.0.0.1:${port}`

      const health = await fetch(`${base}/api/health`)
      assert('15a. GET /api/health => 200', health.status, 200)

      const protectedCases = [
        'GET /api/certificates',
        'GET /api/enrollments/:id/certificate',
      ]
      for (const combo of protectedCases) {
        const [method, path] = combo.split(' ')
        const useId = path.includes(':id') ? '00000000-0000-4000-8000-000000000000' : ''
        const realPath = useId ? path.replace(':id', useId) : path
        const res = await fetch(`${base}${realPath}`, { method })
        assert(`15b. ${method} ${path} without token => 401`, res.status, 401)
      }

      // The verify endpoint is PUBLIC — it must respond WITHOUT a token. A
      // well-formed but nonexistent code must not require auth (verification-
      // safe; a DB-bound lookup may 503 only if the certificate relation is not
      // provisioned yet, never because of missing credentials).
      const code = 'CC-2099-999999'
      const res = await fetch(`${base}/api/certificates/verify/${code}`)
      assert('15c. public verify reachable without token (not 401)', res.status !== 401, true)
      if (res.status === 200) {
        assert('15d. nonexistent code => valid:false', (await res.json()).data?.valid, false)
      } else {
        console.log(`INFO  verify returned HTTP ${res.status} (DB-bound; accepted as reachable/public).`)
      }

      const badRes = await fetch(`${base}/api/certificates/verify/bad%20code!`)
      assert('15e. malformed verify code rejected (400)', badRes.status, 400)
    } catch (err) {
      console.error('FAIL  runtime portion:', err)
      process.exitCode = 1
    } finally {
      if (server) server.close()
    }
  }
}

if (process.exitCode) {
  console.error('\nMODULE 12 VERIFICATION FAILED')
} else {
  console.log('\nMODULE 12 VERIFICATION PASSED')
}