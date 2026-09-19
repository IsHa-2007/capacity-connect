// MODULE 10 — ASSESSMENT CONTROLLER
//
// Thin HTTP adapter, identical in shape to Module 9's enrollment.controller
// (hydrateActor → assessment.service). No business rule lives here. The service
// is the single authority for RBAC / distribution / scoring / snapshot math.

import { sendSuccess } from '../utils/apiResponse.js'
import * as assessmentService from '../services/assessment.service.js'
import { findProfileById, toProfile } from '../repositories/user.repository.js'

async function hydrateActor(req) {
  if (!req.user) return null
  const profile = await findProfileById(req.user.id)
  return profile ? toProfile(profile) : null
}

export async function startAssessment(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await assessmentService.startAssessment(actor, req.params.enrollmentId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function submitAssessment(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await assessmentService.submitAssessment(
      actor,
      req.params.enrollmentId,
      req.params.attemptId,
      req.body,
    )
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}

export async function listAttempts(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    const data = await assessmentService.listAttempts(actor, req.params.enrollmentId)
    return sendSuccess(res, data)
  } catch (err) { return next(err) }
}