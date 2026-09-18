// Module 8 �?" COURSE & QUESTION-BANK CONTROLLER
//
// Thin HTTP adapter. The authoritative RBAC + business rules live in
// `services/course.service.js` (single Module 8 authority). This controller:
//
//   * Reads the ACTOR purely from `req.user` (the object hydrated by
//     `middleware/authenticate`). The actor shape supplied by the service's
//     `findProfileById`-style repository return is
//     `{ id, role, approvalStatus, ...PROFILE_REST } �?" where:
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
    const data = await courseService.getCourse(req.user, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function createCourse(req, res, next) {
  try {
    const data = await courseService.createCourse(req.user, req.body)
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

export async function updateCourse(req, res, next) {
  try {
    const data = await courseService.updateCourse(req.user, req.params.id, req.body)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function deleteCourse(req, res, next) {
  try {
    const data = await courseService.deleteCourse(req.user, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function listSections(req, res, next) {
  try {
    const data = await courseService.listSections(req.user, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function addSection(req, res, next) {
  try {
    const data = await courseService.addSection(req.user, req.params.id, req.body)
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

export async function removeSection(req, res, next) {
  try {
    const data = await courseService.removeSection(req.user, req.params.id, req.params.sectionId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function listQuestions(req, res, next) {
  try {
    const data = await courseService.listQuestions(req.user, req.params.id)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function addQuestion(req, res, next) {
  try {
    const data = await courseService.addQuestion(req.user, req.params.id, req.body)
    return sendSuccess(res, data, 201)
  } catch (err) { return next(err) }
}

export async function updateQuestion(req, res, next) {
  try {
    const data = await courseService.updateQuestion(req.user, req.params.id, req.params.questionId, req.body)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function removeQuestion(req, res, next) {
  try {
    const data = await courseService.removeQuestion(req.user, req.params.id, req.params.questionId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}
