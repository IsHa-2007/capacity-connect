// MODULE 9 — ENROLLMENT CONTROLLER
//
// Thin HTTP adapter — the SAME shape as Module 8 (course.controller is the
// template). It hydrates the actor (findProfileById→toProfile, identical to
// course.controller.hydrateActor) then forwards to enrollment.service, which is
// the single authority for every Module 9 rule (RBAC / ownership / duplicates /
// progression). sendSuccess wraps every 2xx; ApiError is forwarded to the
// error middleware. No business rule ever lives here.

import { ApiError } from '../utils/apiResponse.js'
import { sendSuccess } from '../utils/apiResponse.js'
import * as enrollmentService from '../services/enrollment.service.js'
import { findProfileById, toProfile } from '../repositories/user.repository.js'

async function hydrateActor(req) {
  if (!req.user) return null
  const profile = await findProfileById(req.user.id)
  return profile ? toProfile(profile) : null
}

export async function listEnrollments(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await enrollmentService.listEnrollments(actor, req.query))
  } catch (err) { return next(err) }
}

export async function enroll(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await enrollmentService.enroll(actor, req.body), 201)
  } catch (err) { return next(err) }
}

export async function getEnrollment(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await enrollmentService.getEnrollment(actor, req.params.id))
  } catch (err) { return next(err) }
}

export async function getWorkspace(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await enrollmentService.getWorkspace(actor, req.params.id))
  } catch (err) { return next(err) }
}

export async function updateEnrollment(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await enrollmentService.updateEnrollment(actor, req.params.id, req.body))
  } catch (err) { return next(err) }
}
