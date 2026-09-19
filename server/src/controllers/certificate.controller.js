// MODULE 12 — CERTIFICATE CONTROLLER
//
// Thin HTTP adapter — the same shape as enrollment.controller (hydrateActor →
// service). The service owns RBAC, eligibility and issuance; nothing is decided
// here. sendSuccess wraps every 2xx; ApiError forwards to the error middleware.

import { ApiError } from '../utils/apiResponse.js'
import { sendSuccess } from '../utils/apiResponse.js'
import * as certificateService from '../services/certificate.service.js'
import { findProfileById, toProfile } from '../repositories/user.repository.js'

async function hydrateActor(req) {
  if (!req.user) return null
  const profile = await findProfileById(req.user.id)
  return profile ? toProfile(profile) : null
}

export async function getEnrollmentCertificate(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await certificateService.getOrIssueCertificate(actor, req.params.id))
  } catch (err) { return next(err) }
}

export async function listCertificates(req, res, next) {
  try {
    const actor = await hydrateActor(req)
    return sendSuccess(res, await certificateService.listCertificates(actor))
  } catch (err) { return next(err) }
}

// PUBLIC verification — deliberately NO authenticate() middleware. Only
// verification-safe fields are ever returned (see certificate.service).
export async function verifyCertificate(req, res, next) {
  try {
    return sendSuccess(res, await certificateService.verifyCertificate(req.params.verificationCode))
  } catch (err) { return next(err) }
}