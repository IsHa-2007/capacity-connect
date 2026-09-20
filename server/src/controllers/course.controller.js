// Module 8 �?" COURSE & QUESTION-BANK CONTROLLER
//
// Thin HTTP adapter. The authoritative RBAC + business rules live in
// `services/course.service.js` (single Module 8 authority). This controller:
//
//   * Reads the ACTOR via `hydrateActor(req)` (below). `middleware/authenticate`
//     only sets `{id,email,phone}` on `req.user`; the course service's
//     `requireTrainer`/`isApproved` read `actor.role` and
//     `actor.approvalStatus`, so every handler here hydrates the full profile
//     (`toProfile`) exactly like `middleware/authorize.js` and the enrollment /
//     assessment controllers do. The actor contract is
//     `{ id, role, approvalStatus, ...PROFILE_REST }` where:
//        - `role`            is one of the authorized ROLES (ADMIN/TRAINER/TRAINEE)
//        - `approvalStatus`  is one of APPROVAL_STATUSES (PENDING/APPROVED/REJECTED)
//     That is the SAME actor contract `course.service.js` returns from its
//     repository hydration and the SAME contract `middleware/authorize.js`
//     enforces via `requireApprovedUser`.
//
//   * Delegates EVERY decf �?"sion to the service. It never performs its own
//     RBAC, never touches the repository, and never reads a DB column name.
//
//   * Returns responses via the shared `sendSuccess` helper. There is NO
//     `sendPaginated` in this codebase �?" list responses are wrapped the same
//     way every other Module follows (see user.controller.js / apiResponse.js).

import * as courseService from '../services/course.service.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { findProfileById, toProfile } from '../repositories/user.repository.js'

const COURSE_MAX_LIMIT = 200

// Hydrate the RBAC actor the same way `middleware/authorize.js` does: the
// service's `requireTrainer`/`isApproved` read `actor.role` and
// `actor.approvalStatus`, but `authenticate` only sets `{id,email,phone}` on
// `req.user`. `toProfile` produces the exact camelCase actor contract
// `course.service.js` accepts.
async function hydrateActor(req) {
  const profile = await findProfileById(req.user.id)
  if (!profile) return null
  return toProfile(profile)
}

export async function listCourses(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.listCourses(actor, req.query)
    const { courses, total, limit, offset } = data
    return sendSuccess(res, {
      courses: courses ?? [],
      pagination: { total, limit: limit ?? COURSE_MAX_LIMIT, offset: offset ?? 0 },
    })
  } catch (err) { return next(err) }
}

export async function getCourse(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.getCourse(actor, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function createCourse(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.createCourse(actor, req.body)
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

export async function updateCourse(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.updateCourse(actor, req.params.id, req.body)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function deleteCourse(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.deleteCourse(actor, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function listSections(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.listSections(actor, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function addSection(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.addSection(actor, req.params.id, req.body)
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

// POST /api/courses/:id/sections/upload — multipart file upload into the
// private storage bucket. The actor is hydrated for full RBAC (the section
// service requires an APPROVED TRAINER owner); the file is parsed by multer and
// all storage metadata is derived server-side.
export async function uploadSection(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.uploadSection(actor, req.params.id, {
      file: req.file,
      sectionType: req.body?.sectionType,
      orderIndex: req.body?.orderIndex,
      title: req.body?.title || null,
    })
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

export async function removeSection(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.removeSection(actor, req.params.id, req.params.sectionId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function listQuestions(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.listQuestions(actor, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function getQuestion(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.getQuestion(actor, req.params.id, req.params.questionId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function addQuestion(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.addQuestion(actor, req.params.id, req.body)
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

export async function updateQuestion(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.updateQuestion(actor, req.params.id, req.params.questionId, req.body)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function removeQuestion(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await courseService.removeQuestion(actor, req.params.id, req.params.questionId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}
