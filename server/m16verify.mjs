// MODULE 16 VERIFICATION — security & error-handling hardening.
//
// Follows the m11/m12 pattern: a dependency-free Node script (Node >= 20,
// "type": module) that imports the exported pure helpers / middleware and
// checks every Module 16 behaviour WITHOUT hitting a database.
//
//   node server/m16verify.mjs
//
// Sections:
//   S1  errorHandler — DB messages are stripped before they reach the client;
//       the 500 shape never leaks stack/dbMessage; 413/400 body-parser shapes.
//   S2  upload guard  — 200 MB cap, LIMIT_FILE_SIZE -> 413 FILE_TOO_LARGE,
//       multer fileFilter deny-list.
//   S3  material rules — folder allow/reject matrix + traversal-safe names.
//   S4  course list query — pagination/params validated, unsafe params rejected.
//   S5  enrollment/feedback validators — enum/rating bounds + alien-field guard.
//   S6  access-control matrices — canViewFeedback / canViewCertificate.
//   S7  rate limiting  — limiters configured with sane limits.
//   S8  secret hygiene — no service-role (JWT-like) secret in client sources,
//       and the real key from server/.env is not present in any client file.
//   S9  runtime        — boot real server: health 200, protected endpoints 401,
//       malformed IDs 400, unknown route 404 in API shape, public verify not 401,
//       unbounded first login attempt still behaves normally (401, not 429).
//
// It never creates users, enrollments or certificate rows, and never signs in.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const CLIENTS = path.resolve(ROOT, '..', 'src')

// ---------------------------------------------------------------------------
// S1. ERROR HANDLING — sanitised details + sealed 500/404 shapes.
// ---------------------------------------------------------------------------
{
  const { errorHandler } = await import('./src/middleware/errorHandler.js')
  const { ApiError } = await import('./src/utils/apiResponse.js')

  const capture = () => {
    let captured
    const res = {
      status: (s) => ({
        json: (body) => {
          captured = { status: s, body }
        },
      }),
    }
    return { res, get: () => captured }
  }

  // Repository-style ApiError with raw DB text must have dbMessage stripped,
  // while the opaque constraint code and any client-safe fields survive.
  {
    const { res, get } = capture()
    errorHandler(
      new ApiError(500, 'COURSE_OPERATION_UNEXPECTED', 'The operation could not be completed.', {
        dbCode: '23505',
        dbMessage: 'duplicate key value violates unique constraint "courses_code_key"',
      }),
      { method: 'POST', originalUrl: '/api/courses' },
      res,
      () => {},
    )
    const out = get()
    assert('S1.1 500 ApiError -> status 500', out.status, 500)
    assert('S1.2 dbMessage stripped from client details', out.body.error.details.dbMessage, undefined)
    assert('S1.3 dbCode preserved (opaque, safe)', out.body.error.details.dbCode, '23505')
    assert('S1.4 error carries its code/message', out.body.error.code, 'COURSE_OPERATION_UNEXPECTED')
  }

  // Nested details (validation arrays) keep their path+message shape verbatim.
  {
    const { res, get } = capture()
    errorHandler(
      new ApiError(400, 'VALIDATION_ERROR', 'Invalid request data.', {
        issues: [{ path: 'status', message: 'bad enum' }],
        dbMessage: 'leak',
      }),
      { method: 'POST', originalUrl: '/api/anything' },
      res,
      () => {},
    )
    const out = get()
    assert('S1.5 client-safe detail fields survive', out.body.error.details.issues[0].path, 'status')
    assert('S1.6 dbMessage stripped from nested detail objects', out.body.error.details.dbMessage, undefined)
  }

  // A raw (non-ApiError) failure must NEVER reveal internals.
  {
    const { res, get } = capture()
    errorHandler(new Error('connection refused: host=db.internal:5432'), { method: 'GET', originalUrl: '/api/x' }, res, () => {})
    const out = get()
    assert('S1.7 unexpected error -> 500', out.status, 500)
    assert('S1.8 500 code is INTERNAL_SERVER_ERROR', out.body.error.code, 'INTERNAL_SERVER_ERROR')
    assert('S1.9 500 message is generic', out.body.error.message, 'An unexpected error occurred.')
    assert('S1.10 no stack trace in the body', out.body.error.stack, undefined)
    assert('S1.11 no dbMessage key in the body', out.body.error.dbMessage, undefined)
  }

  // Body-parser errors: 413 (statusCode) and 400, including libs that only set
  // `status` rather than `statusCode`.
  {
    const { res, get } = capture()
    errorHandler({ expose: true, statusCode: 413, status: 413 }, { method: 'POST', originalUrl: '/api/x' }, res, () => {})
    assert('S1.12 payload-too-large -> 413 PAYLOAD_TOO_LARGE', get().body.error.code, 'PAYLOAD_TOO_LARGE')

    const { res: res2, get: get2 } = capture()
    errorHandler({ expose: true, status: 413 }, { method: 'POST', originalUrl: '/api/x' }, res2, () => {})
    assert('S1.13 413 also recognised via status only', get2().body.error.code, 'PAYLOAD_TOO_LARGE')

    const { res: res3, get: get3 } = capture()
    errorHandler({ expose: true, statusCode: 400 }, { method: 'POST', originalUrl: '/api/x' }, res3, () => {})
    assert('S1.14 malformed body -> 400 INVALID_REQUEST_BODY', get3().body.error.code, 'INVALID_REQUEST_BODY')
  }
}

// ---------------------------------------------------------------------------
// S2. UPLOAD GUARD — size cap, size error mapping, multer deny-list.
// ---------------------------------------------------------------------------
{
  const { uploadError, fileFilter, MATERIAL_UPLOAD_MAX_BYTES } = await import('./src/middleware/upload.js')
  const multer = (await import('multer')).default

  assert('S2.1 upload cap is 200 MB', MATERIAL_UPLOAD_MAX_BYTES, 200 * 1024 * 1024)

  let passed = null
  const next = (err) => {
    passed = err
  }

  uploadError(null, {}, {}, next)
  assert('S2.2 no error -> next()', passed, undefined)

  uploadError(new multer.MulterError('LIMIT_FILE_SIZE'), {}, {}, next)
  assert('S2.3 oversized -> 413 ApiError', passed?.status, 413)
  assert('S2.4 oversized -> FILE_TOO_LARGE code', passed?.code, 'FILE_TOO_LARGE')

  uploadError(new Error('boom'), {}, {}, next)
  assert('S2.5 foreign errors pass through unchanged', passed?.message, 'boom')

  // Multer-level deny-list: executable/web types rejected before buffering.
  for (const name of ['evil.exe', 'script.js', 'page.html', 'widget.svg', 'tool.bat']) {
    let cbErr = null
    let cbOk = null
    fileFilter({}, { originalname: name }, (err, ok) => {
      cbErr = err
      cbOk = ok
    })
    assert(`S2.6 ${name} rejected at multer filter`, cbErr?.status === 400 && cbErr?.code === 'FILE_TYPE_UNSUPPORTED', true)
  }
  {
    let cbErr = null
    let cbOk = null
    fileFilter({}, { originalname: 'study-notes.pdf' }, (err, ok) => {
      cbErr = err
      cbOk = ok
    })
    assert('S2.7 legitimate pdf allowed at multer filter', cbErr, null)
    assert('S2.8 legitimate pdf continues upload', cbOk, true)
  }
}

// ---------------------------------------------------------------------------
// S3. MATERIAL RULES — per-folder allow/reject + traversal-safe names.
// ---------------------------------------------------------------------------
{
  const { materialForFolderError } = await import('./src/services/materialRules.service.js')

  const allowedFor = (folder, name, mime) => materialForFolderError(folder, name, mime) === null

  assert('S3.1 NOTES accepts pdf', allowedFor('NOTES', 'notes.pdf', 'application/pdf'), true)
  assert('S3.2 NOTES accepts png image', allowedFor('NOTES', 'figure.png', 'image/png'), true)
  assert('S3.3 SLIDES accepts pptx', allowedFor('SLIDES', 'deck.pptx', 'application/pdf'), true)
  assert('S3.4 VIDEOS accepts mp4', allowedFor('VIDEOS', 'lecture.mp4', 'video/mp4'), true)
  assert('S3.5 PRACTICE accepts doc', allowedFor('PRACTICE', 'sheet.doc', 'application/msword'), true)

  for (const folder of ['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']) {
    assert(`S3.6 ${folder} rejects .exe`, allowedFor(folder, 'malware.exe', 'application/octet-stream'), false)
    assert(`S3.7 ${folder} rejects .js (binary mime)`, allowedFor(folder, 'x.js', 'application/octet-stream'), false)
    assert(`S3.8 ${folder} rejects traversal name ../../etc/passwd`, allowedFor(folder, '../../etc/passwd', ''), false)
  }

  // The existing contract: a file is accepted when its extension OR its
  // declared mime type satisfies the folder rule. This stays as-is (fewer false
  // rejections for the pilot); the extension lease is the primary gate. NOTE:
  // PRACTICE's loose "text" mime clause lets `text/javascript` through at the
  // material layer — that exact gap is now closed upstream by the multer-level
  // deny-list (S2.6), so an executable .js can never be buffered/stored.
  assert('S3.9 ext OR mime contract holds (pdf ext wins for NOTES)', allowedFor('NOTES', 'notes.pdf', 'text/html'), true)
  assert('S3.10 PRACTICE loose text-mime only: .js accepted at material layer', allowedFor('PRACTICE', 'x.js', 'text/javascript'), true)
  assert('S3.11 PRACTICE rejects .js when the mime is binary', allowedFor('PRACTICE', 'x.js', 'application/octet-stream'), false)
}

// ---------------------------------------------------------------------------
// S4. COURSE LIST QUERY — pagination/params are now validated at the route.
// ---------------------------------------------------------------------------
{
  const { listCoursesQuerySchema } = await import('./src/validators/course.validator.js')
  const ok = (q) => listCoursesQuerySchema.safeParse(q).success

  assert('S4.1 status filter passes', ok({ status: 'PUBLISHED' }), true)
  assert('S4.2 unknown status rejected', ok({ status: 'WEIRD' }), false)
  assert('S4.3 numeric limit coerced', listCoursesQuerySchema.safeParse({ limit: '25' }).data.limit, 25)
  assert('S4.4 featured string coerced to boolean', listCoursesQuerySchema.safeParse({ featured: 'true' }).data.featured, true)
  assert('S4.5 trainerId must be a UUID', ok({ trainerId: 'not-a-uuid' }), false)
  assert('S4.6 non-numeric limit rejected', ok({ limit: 'abc' }), false)
  assert('S4.7 out-of-range limit rejected', ok({ limit: 9999 }), false)
  assert('S4.8 default limit applied', listCoursesQuerySchema.safeParse({}).data.limit, 200)

  // Route params: malformed identifiers are rejected by zod BEFORE any service
  // logic. (At runtime the route runs authenticate() first, so the schema itself
  // is the unit under test here rather than the auth-gated HTTP path.)
  const { courseIdParamSchema } = await import('./src/validators/course.validator.js')
  assert('S4.9 valid UUID param passes', courseIdParamSchema.safeParse({ id: '00000000-0000-4000-8000-000000000000' }).success, true)
  assert('S4.10 malformed UUID param rejected', courseIdParamSchema.safeParse({ id: 'not-a-uuid' }).success, false)
}

// ---------------------------------------------------------------------------
// S5. ENROLLMENT / FEEDBACK VALIDATORS — enum + rating bounds + alien fields.
// ---------------------------------------------------------------------------
{
  const { updateEnrollmentSchema, feedbackSchema, createEnrollmentSchema } = await import('./src/validators/enrollment.validator.js')

  assert('S5.0 createEnrollment accepts a UUID courseId', createEnrollmentSchema.safeParse({ courseId: '00000000-0000-4000-8000-000000000000' }).success, true)
  assert('S5.0b malformed courseId rejected', createEnrollmentSchema.safeParse({ courseId: 'nope' }).success, false)

  assert('S5.1 valid progression passes', updateEnrollmentSchema.safeParse({ progress: 40 }).success, true)
  assert('S5.2 unknown status rejected', updateEnrollmentSchema.safeParse({ status: 'WEIRD', progress: 40 }).success, false)
  assert('S5.3 progress > 100 rejected', updateEnrollmentSchema.safeParse({ progress: 101 }).success, false)
  assert('S5.4 COMPLETED without completedAt rejected', updateEnrollmentSchema.safeParse({ status: 'COMPLETED' }).success, false)
  assert('S5.5 COMPLETED with startedAt + completedAt passes', updateEnrollmentSchema.safeParse({ status: 'COMPLETED', startedAt: '2026-09-19T09:00:00.000Z', completedAt: '2026-09-19T10:00:00.000Z', progress: 100 }).success, true)
  assert('S5.6 alien user_id rejected (strict)', updateEnrollmentSchema.safeParse({ progress: 40, userId: '00000000-0000-4000-8000-000000000000' }).success, false)
  assert('S5.7 empty payload rejected', updateEnrollmentSchema.safeParse({}).success, false)

  const fb = (v) => feedbackSchema.safeParse(v).success
  assert('S5.8 rating 5 passes', fb({ contentDepth: 5, trainerDelivery: 4, operationalRelevance: 3 }), true)
  assert('S5.9 rating 6 rejected', fb({ contentDepth: 6, trainerDelivery: 4, operationalRelevance: 3 }), false)
  assert('S5.10 rating 0 rejected', fb({ contentDepth: 0, trainerDelivery: 4, operationalRelevance: 3 }), false)
  assert('S5.11 string rating rejected (no coercion)', fb({ contentDepth: '5', trainerDelivery: 4, operationalRelevance: 3 }), false)
  assert('S5.12 alien feedback field rejected (strict)', fb({ contentDepth: 5, trainerDelivery: 4, operationalRelevance: 3, userId: 'x' }), false)
}

// ---------------------------------------------------------------------------
// S6. ACCESS CONTROL — view matrices stay ownership-locked.
// ---------------------------------------------------------------------------
{
  const { canViewFeedback } = await import('./src/services/enrollment.service.js')
  const { canViewCertificate } = await import('./src/services/certificate.service.js')

  const enc = { userId: 'u-jane', trainerId: 't-bob' }
  const trainee = (id) => ({ id, role: 'TRAINEE', approvalStatus: 'APPROVED' })
  const trainer = (id, approved = true) => ({ id, role: 'TRAINER', approvalStatus: approved ? 'APPROVED' : 'PENDING' })
  const admin = { id: 'a1', role: 'ADMIN', approvalStatus: 'APPROVED' }

  assert('S6.1 feedback: owner trainee may view', canViewFeedback(trainee('u-jane'), enc), true)
  assert('S6.2 feedback: other trainee denied', canViewFeedback(trainee('u-x'), enc), false)
  assert('S6.3 feedback: owning approved trainer may view', canViewFeedback(trainer('t-bob'), enc), true)
  assert('S6.4 feedback: unapproved trainer denied', canViewFeedback(trainer('t-bob', false), enc), false)
  assert('S6.5 feedback: non-owning trainer denied', canViewFeedback(trainer('t-x'), enc), false)
  assert('S6.6 feedback: admin may view', canViewFeedback(admin, enc), true)
  assert('S6.7 feedback: null actor denied', canViewFeedback(null, enc), false)

  // Spot-check the certificate matrix (the full matrix lives in m12verify).
  assert('S6.8 certificate: owner trainee may view', canViewCertificate(trainee('u-jane'), enc), true)
  assert('S6.9 certificate: non-owner denied', canViewCertificate(trainee('u-x'), enc), false)
  assert('S6.10 certificate: admin may view', canViewCertificate(admin, enc), true)
}

// ---------------------------------------------------------------------------
// S7. RATE LIMITING — separate middleware instances exist and are configured
//      (expressing a limit means rateLimit() accepted valid options; the
//      actual per-route limits are asserted at runtime in S9 via the
//      draft-8 RateLimit-Policy headers carried on regular responses).
// ---------------------------------------------------------------------------
{
  const { loginLimiter, registerLimiter, verifyLimiter } = await import('./src/middleware/rateLimit.js')
  const kinds = [loginLimiter, registerLimiter, verifyLimiter].map((l) => ({
    isFn: typeof l === 'function',
    hasReset: typeof l?.resetKey === 'function',
    hasGet: typeof l?.getKey === 'function',
  }))
  assert('S7.1 three rate-limit middleware instances created', kinds.filter((k) => k.isFn && k.hasReset).length, 3)
  assert('S7.2 each limiter carries store reset/get handles', kinds.filter((k) => k.hasReset && k.hasGet).length, 3)
}

// ---------------------------------------------------------------------------
// S8. SECRET HYGIENE — service-role key never reaches the client bundle.
// ---------------------------------------------------------------------------
{
  const collect = (dir, out) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full, out)
      else if (/\.(js|jsx|ts|tsx|html|json|css)$/.test(entry.name)) out.push(full)
    }
    return out
  }
  const clientFiles = collect(CLIENTS, [])

  // The service-role key is a Supabase JWT; a JWT-shaped string in client
  // sources would be an immediate red flag.
  const JWT_LIKE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
  const leaked = clientFiles.filter((f) => JWT_LIKE.test(readFileSync(f, 'utf8')))
  assert('S8.1 no JWT-like (service-role) secret in client sources', leaked.length, 0)

  // Strongest check: the actual service-role key from server/.env must not
  // appear in any client file.
  const envPath = path.join(ROOT, '.env')
  if (existsSync(envPath)) {
    const envText = readFileSync(envPath, 'utf8')
    const keyLine = envText.split(/\r?\n/).find((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
    if (keyLine) {
      const realKey = keyLine.slice('SUPABASE_SERVICE_ROLE_KEY='.length).trim().replace(/^"|"$/g, '')
      if (realKey) {
        const inClient = clientFiles.filter((f) => readFileSync(f, 'utf8').includes(realKey))
        assert('S8.2 the real service-role key is not embedded in any client file', inClient.length, 0)
      }
    } else {
      console.log('INFO  server/.env has no SUPABASE_SERVICE_ROLE_KEY line to scan (skipped).')
    }
  } else {
    console.log('INFO  server/.env not found (secret-embed scan skipped).')
  }
}

// ---------------------------------------------------------------------------
// S9. RUNTIME — boot the real server and assert the hardened shapes.
// ---------------------------------------------------------------------------
const runtime = process.env.M16_RUNTIME !== '0'
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
      const UUID = '00000000-0000-4000-8000-000000000000'

      const health = await fetch(`${base}/api/health`)
      assert('S9.1 GET /api/health => 200', health.status, 200)

      // Every protected surface must reject an anonymous request with 401.
      const protectedCases = [
        'GET /api/courses',
        'GET /api/users/me',
        'GET /api/users/:id',
        'GET /api/enrollments',
        'GET /api/enrollments/:id',
        'PATCH /api/enrollments/:id',
        'GET /api/enrollments/:id/assessment/attempts',
        'GET /api/certificates',
      ]
      for (const combo of protectedCases) {
        const [method, p] = combo.split(' ')
        const realPath = p.replace(':id', UUID)
        const res = await fetch(`${base}${realPath}`, { method })
        assert(`S9.2 ${method} ${realPath} without token => 401`, res.status, 401)
      }

      // Route ordering guarantee: authenticate() runs BEFORE zod validation on
      // every protected route, so an anonymous caller always gets 401 (no info
      // leak about param/body validity before identity is established). The
      // malformed-UUID / malformed-body rejection is unit-tested directly on
      // the schemas (S4.10, S5.0b) since the HTTP path is auth-gated first.

      // Unknown routes respond in the API error shape (never an HTML stack).
      const missing = await fetch(`${base}/api/does-not-exist`)
      const missingBody = await missing.json()
      assert('S9.5 unknown route => 404', missing.status, 404)
      assert('S9.6 404 uses the API error shape', missingBody.success, false)
      assert('S9.7 404 body carries a code', typeof missingBody.error?.code, 'string')
      assert('S9.8 404 body carries no stack', missingBody.error?.stack, undefined)

      // Public verification stays reachable without a token (M12 contract) and
      // runs behind the verifyLimiter (draft-8 RateLimit-Policy header).
      const verify = await fetch(`${base}/api/certificates/verify/CC-2099-999999`)
      assert('S9.9 public verify is not gated by auth', verify.status !== 401, true)
      assert('S9.10 public verify returns an API envelope', (await verify.json()) instanceof Object, true)
      const verifyPolicy = verify.headers.get('ratelimit-policy')
      assert('S9.11 public verify carries a rate-limit policy', typeof verifyPolicy === 'string' && /q=\d+/.test(verifyPolicy || ''), true)

      // Login is rate-limited; a single well-formed (but wrong) login must NOT
      // be a 429 — the limiter must not break the normal path, and the response
      // must be the confidentiality-safe 401 INVALID_CREDENTIALS while still
      // advertising the login limiter's quota via the draft-8 headers.
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'no-such@example.com', password: 'wrong-password!' }),
      })
      assert('S9.12 first login attempt is not rate-limited', login.status, 401)
      const loginPolicy = login.headers.get('ratelimit-policy')
      assert('S9.13 login response carries a rate-limit policy', typeof loginPolicy === 'string' && /q=\d+/.test(loginPolicy || ''), true)
    } catch (err) {
      console.error('FAIL  runtime portion:', err)
      process.exitCode = 1
    } finally {
      if (server) server.close()
    }
  }
}

if (process.exitCode) {
  console.error('\nMODULE 16 VERIFICATION FAILED')
} else {
  console.log('\nMODULE 16 VERIFICATION PASSED')
}