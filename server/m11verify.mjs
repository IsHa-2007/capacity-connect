// MODULE 11 VERIFICATION — progress, completion & feedback.
//
// Mirrors the m8/m9/m10 style: a dependency-free Node script (Node >= 20, "type":
// module) that imports the exported pure helpers and the zod validators and
// checks every mandated Module 11 behaviour WITHOUT hitting a database.
//
//   node server/m11verify.mjs
//
// The runtime portion (health + authorization gating) boots the real server on
// an alternate port and asserts:
//   * GET  /api/health            -> 200
//   * protected API without token -> 401
// It never creates users or writes real rows.

const assert = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error(`FAIL  ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
    process.exitCode = 1
  } else {
    console.log(`PASS  ${name}`)
  }
}

const throws = async (fn, messageIncludes = '') => {
  try {
    await fn()
  } catch (err) {
    if (messageIncludes && !String(err.message).includes(messageIncludes)) {
      console.error(`FAIL  expected throw containing "${messageIncludes}" but got: ${err.message}`)
      process.exitCode = 1
      return
    }
    console.log(`PASS  (throws): ${messageIncludes || err.message}`)
    return
  }
  console.error(`FAIL  expected a thrown error${messageIncludes ? ` containing "${messageIncludes}"` : ''} but none was thrown`)
  process.exitCode = 1
}

const {
  deriveProgressPlan,
  materialsComplete,
  canCompleteStep,
  typeDone,
  stepCompleted,
  evaluateCompletion,
  isFeedbackEligible,
  canViewFeedback,
  summarizeFeedback,
  MATERIALS_COMPLETE_PROGRESS,
} = await import('./src/services/enrollment.service.js')

const {
  completeSectionSchema,
  feedbackSchema,
  updateEnrollmentSchema,
} = await import('./src/validators/enrollment.validator.js')

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

const sections = (types) =>
  types.map((t, i) => ({ id: uuid(), sectionType: t, orderIndex: i + 1 }))

// ---------------------------------------------------------------------------
// 1. deriveProgressPlan — equal-weight milestones over 0..75, last is always 75,
//    only REAL sections count, ordered, unknown types are ignored.
// ---------------------------------------------------------------------------
{
  const plan = deriveProgressPlan(sections(['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']))
  assert('1a. milestones equal-weighted 0..75', plan.steps.map((s) => s.milestone), [19, 38, 56, 75])
  assert('1b. total sections counted', plan.total, 4)
  assert('1c. threshold is 75', plan.threshold, MATERIALS_COMPLETE_PROGRESS)
  assert('1d. every type exists', plan.exists, { notes: true, slides: true, videos: true, practice: true })
  assert('1e. steps sorted by order_index', plan.steps.map((s) => s.sectionType), ['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE'])
}

{
  const plan = deriveProgressPlan(sections(['NOTES']))
  assert('2a. single section milestone is 75', plan.steps.map((s) => s.milestone), [75])
  assert('2b. other types do not exist', plan.exists, { notes: true, slides: false, videos: false, practice: false })
}

{
  const plan = deriveProgressPlan(sections(['SLIDES', 'SLIDES', 'PRACTICE', 'VIDEOS']))
  assert('3a. per-type buckets', {
    notes: plan.byType.notes.length,
    slides: plan.byType.slides.length,
    videos: plan.byType.videos.length,
    practice: plan.byType.practice.length,
  }, { notes: 0, slides: 2, videos: 1, practice: 1 })
}

{
  const plan = deriveProgressPlan([{ id: 'not-a-type', sectionType: 'QUIZ', orderIndex: 1 }])
  assert('4a. unknown material types ignored', plan.total, 0)
  assert('4b. no sections => threshold 0', plan.threshold, 0)
  assert('4c. no sections => vacuous materials complete', materialsComplete(plan, 0), true)
}

// ---------------------------------------------------------------------------
// 5. materialsComplete requires every leading step milestone.
// ---------------------------------------------------------------------------
{
  const plan = deriveProgressPlan(sections(['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']))
  assert('5a. progress 0 not complete', materialsComplete(plan, 0), false)
  assert('5b. progress 19 not complete', materialsComplete(plan, 19), false)
  assert('5c. progress 74 not complete', materialsComplete(plan, 74), false)
  assert('5d. progress 75 complete', materialsComplete(plan, 75), true)
}

// ---------------------------------------------------------------------------
// 6/7. canCompleteStep — strictly ordered gate + unknown section.
// ---------------------------------------------------------------------------
{
  const plan = deriveProgressPlan(sections(['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']))
  const [n, s, v, p] = plan.steps
  assert('6a. first section always allowed', canCompleteStep(plan, 0, n.sectionId).allowed, true)
  assert('6b. second blocked at 0', canCompleteStep(plan, 0, s.sectionId).allowed, false)
  assert('6c. second allowed at 19', canCompleteStep(plan, 19, s.sectionId).allowed, true)
  assert('6d. third blocked at 19', canCompleteStep(plan, 19, v.sectionId).allowed, false)
  assert('6e. third allowed at 38', canCompleteStep(plan, 38, v.sectionId).allowed, true)
  assert('6f. fourth requires 56', canCompleteStep(plan, 56, p.sectionId).allowed, true)
  assert('6g. already-complete step is allowed (idempotent)', canCompleteStep(plan, 19, n.sectionId).allowed, true)
  assert('7a. unknown section never allowed', canCompleteStep(plan, 56, uuid()).allowed, false)
}

// ---------------------------------------------------------------------------
// 8. evaluateCompletion — the server-authoritative decision.
// ---------------------------------------------------------------------------
{
  const plan = deriveProgressPlan(sections(['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']))
  const now = new Date('2026-09-19T10:00:00.000Z')

  const snap = (name, over, out) =>
    assert(name, evaluateCompletion({ plan, enrollment: { status: 'ENROLLED', progress: 0, ...over }, now }).progress, out)

  const start = evaluateCompletion({ plan, enrollment: { status: 'ENROLLED', progress: 0 } })
  assert('8a. fresh enrollment stays ENROLLED', start.status, 'ENROLLED')

  const mid = evaluateCompletion({ plan, enrollment: { status: 'IN_PROGRESS', progress: 38 } })
  assert('8b. partial progress untouched', mid.progress, 38)

  const full = evaluateCompletion({
    plan,
    enrollment: { status: 'IN_PROGRESS', progress: 75, assessment: { passed: true } },
    now,
  })
  assert('8c. materials + passed => COMPLETED', full.status, 'COMPLETED')
  assert('8d. complete => progress 100', full.progress, 100)
  assert('8e. complete => server time', (evaluateCompletion({ plan, enrollment: { status: 'IN_PROGRESS', progress: 75, assessment: { passed: true }, completedAt: null }, now })).completedAt, now.toISOString())

  const waiting = evaluateCompletion({ plan, enrollment: { status: 'IN_PROGRESS', progress: 75 } })
  assert('8f. materials done, not passed => IN_PROGRESS', waiting.status, 'IN_PROGRESS')
  assert('8g. materials done, not passed => 75 (never 100)', waiting.progress, 75)

  const cancelled = evaluateCompletion({ plan, enrollment: { status: 'CANCELLED', progress: 19 } })
  assert('8h. cancelled stays CANCELLED', cancelled.status, 'CANCELLED')

  snap('8i. 1/4  => 19', { progress: 19 }, 19)
  snap('8j. 3/4  => 56', { progress: 56 }, 56)
}

// ---------------------------------------------------------------------------
// 9/10. typeDone + stepCompleted compatibility flags.
// ---------------------------------------------------------------------------
{
  const plan = deriveProgressPlan(sections(['NOTES', 'SLIDES', 'VIDEOS', 'PRACTICE']))
  assert('9a. notes done at 19', typeDone(plan, 19, 'notes'), true)
  assert('9b. slides not done at 19', typeDone(plan, 19, 'slides'), false)
  assert('9c. slides done at 38', typeDone(plan, 38, 'slides'), true)
  assert('9d. videos done at 56', typeDone(plan, 56, 'videos'), true)
  assert('9e. practice done at 75', typeDone(plan, 75, 'practice'), true)
  const notesOnly = deriveProgressPlan(sections(['NOTES']))
  assert('9f. missing type never done', typeDone(notesOnly, 0, 'videos'), false)
  assert('10a. stepCompleted false before milestone', stepCompleted(plan, 0, plan.steps[0].sectionId), false)
  assert('10b. stepCompleted true at milestone', stepCompleted(plan, 19, plan.steps[0].sectionId), true)
}

// ---------------------------------------------------------------------------
// 11. isFeedbackEligible — only after the assessment is passed.
// ---------------------------------------------------------------------------
{
  assert('11a. not eligible without pass', isFeedbackEligible({ status: 'IN_PROGRESS', assessment: { passed: false } }), false)
  assert('11b. not eligible without attempt', isFeedbackEligible({ status: 'IN_PROGRESS', assessment: { passed: null } }), false)
  assert('11c. not eligible when cancelled', isFeedbackEligible({ status: 'CANCELLED', assessment: { passed: true } }), false)
  assert('11d. eligible after pass', isFeedbackEligible({ status: 'IN_PROGRESS', assessment: { passed: true } }), true)
}

// ---------------------------------------------------------------------------
// 12. canViewFeedback RBAC matrix.
// ---------------------------------------------------------------------------
{
  const enc = { userId: 'u-jane', trainerId: 't-bob', courseId: 'c-x' }
  const trainee = (id) => ({ id, role: 'TRAINEE', approvalStatus: 'APPROVED' })
  const trainer = (id, approved = true) => ({ id, role: 'TRAINER', approvalStatus: approved ? 'APPROVED' : 'PENDING' })
  const admin = { id: 'a1', role: 'ADMIN', approvalStatus: 'APPROVED' }

  assert('12a. owner trainee may view', canViewFeedback(trainee('u-jane'), enc), true)
  assert('12b. other trainee may not', canViewFeedback(trainee('u-other'), enc), false)
  assert('12c. owning trainer may view', canViewFeedback(trainer('t-bob'), enc), true)
  assert('12d. unapproved trainer may not', canViewFeedback(trainer('t-bob', false), enc), false)
  assert('12e. other trainer may not', canViewFeedback(trainer('t-other'), enc), false)
  assert('12f. admin may view', canViewFeedback(admin, enc), true)
  assert('12g. null actor denied', canViewFeedback(null, enc), false)
}

// ---------------------------------------------------------------------------
// 13. summarizeFeedback aggregates.
// ---------------------------------------------------------------------------
{
  assert('13a. empty set => zero analytics', summarizeFeedback([]).feedbackCount, 0)
  assert('13b. empty ratings zeroed', summarizeFeedback([]).feedbackRatings, { contentDepth: 0, trainerDelivery: 0, operationalRelevance: 0 })
  const rows = [
    { feedback: { contentDepth: 5, trainerDelivery: 4, operationalRelevance: 5 } },
    { feedback: { contentDepth: 3, trainerDelivery: 2, operationalRelevance: 1 } },
    { feedback: {} },
  ]
  const s = summarizeFeedback(rows)
  assert('13c. count excludes blanks', s.feedbackCount, 2)
  assert('13d. average contentDepth', s.averageContentDepth, 4)
  assert('13e. average trainerDelivery', s.averageTrainerDelivery, 3)
  assert('13f. average operationalRelevance', s.averageOperationalRelevance, 3)
  assert('13g. average overall', s.averageOverall, Number(((4 + 3 + 3) / 3).toFixed(2)))
  assert('13h. feedbackRatings compat shape', s.feedbackRatings, { contentDepth: 4, trainerDelivery: 3, operationalRelevance: 3 })
}

// ---------------------------------------------------------------------------
// Validators — strict rejection of alien fields and out-of-range ratings.
// ---------------------------------------------------------------------------
{
  const okSection = completeSectionSchema.safeParse({ sectionId: uuid() })
  assert('14a. completeSection accepts sectionId', okSection.success, true)
  assert('14b. completeSection rejects extra keys', completeSectionSchema.safeParse({ sectionId: uuid(), progress: 99 }).success, false)
  assert('14c. completeSection rejects bad uuid', completeSectionSchema.safeParse({ sectionId: 'nope' }).success, false)

  const goodFeedback = feedbackSchema.safeParse({ contentDepth: 5, trainerDelivery: 4, operationalRelevance: 3 })
  assert('15a. feedback accepts valid ratings', goodFeedback.success, true)
  assert('15b. feedback accepts suggestions', feedbackSchema.safeParse({ contentDepth: 5, trainerDelivery: 4, operationalRelevance: 3, suggestions: 'Great' }).success, true)
  assert('15c. rating 0 rejected', feedbackSchema.safeParse({ contentDepth: 0, trainerDelivery: 4, operationalRelevance: 3 }).success, false)
  assert('15d. rating 6 rejected', feedbackSchema.safeParse({ contentDepth: 6, trainerDelivery: 4, operationalRelevance: 3 }).success, false)
  assert('15e. fractional rating rejected', feedbackSchema.safeParse({ contentDepth: 3.5, trainerDelivery: 4, operationalRelevance: 3 }).success, false)
  assert('15f. missing factor rejected', feedbackSchema.safeParse({ contentDepth: 4, trainerDelivery: 4 }).success, false)
  assert('15g. alien field rejected', feedbackSchema.safeParse({ contentDepth: 4, trainerDelivery: 4, operationalRelevance: 4, extra: 1 }).success, false)
  assert('15h. over-length suggestions rejected', feedbackSchema.safeParse({ contentDepth: 4, trainerDelivery: 4, operationalRelevance: 4, suggestions: 'x'.repeat(2001) }).success, false)

  assert('16a. updateEnrollment still accepts status', updateEnrollmentSchema.safeParse({ status: 'IN_PROGRESS' }).success, true)
  assert('16b. updateEnrollment still accepts progress', updateEnrollmentSchema.safeParse({ progress: 50 }).success, true)
  assert('16c. updateEnrollment rejects alien key', updateEnrollmentSchema.safeParse({ user_id: 'u-1' }).success, false)
}

// ---------------------------------------------------------------------------
// RUNTIME — boot real server (alt port) + authorization gating.
// ---------------------------------------------------------------------------
const runtime = process.env.M11_RUNTIME !== '0'
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
      assert('17a. GET /api/health => 200', health.status, 200)

      const unauthCases = [
        ['GET', '/api/enrollments'],
        ['GET', '/api/enrollments/analytics/feedback'],
        ['POST', '/api/enrollments'],
        ['PATCH', '/api/enrollments/:id/feedback'],
        ['POST', '/api/enrollments/:id/progress'],
        ['GET', '/api/enrollments/:id/feedback'],
        ['GET', '/api/enrollments/:id/workspace'],
        ['GET', '/api/courses'],
      ]
      for (const [method, path] of unauthCases) {
        const useId = path.includes(':id') ? uuid() : ''
        const realPath = useId ? path.replace(':id', useId) : path
        const wrap = (obj) => (obj && method === 'GET' ? undefined : obj)
        const useBody = wrap(useId ? { sectionId: uuid(), contentDepth: 5, trainerDelivery: 4, operationalRelevance: 3 } : null)
        const res = await fetch(`${base}${realPath}`, {
          method,
          headers: useBody ? { 'content-type': 'application/json' } : {},
          body: useBody ? JSON.stringify(useBody) : undefined,
        })
        assert(`17b. ${method} ${path} without token => 401`, res.status, 401)
      }
    } catch (err) {
      console.error('FAIL  runtime portion:', err)
      process.exitCode = 1
    } finally {
      if (server) server.close()
    }
  }
}

if (process.exitCode) {
  console.error('\nMODULE 11 VERIFICATION FAILED')
} else {
  console.log('\nMODULE 11 VERIFICATION PASSED')
}