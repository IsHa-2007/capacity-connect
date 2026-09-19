import * as analyticsService from '../services/analytics.service.js'
import * as dispatchService from '../services/dispatch.service.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { parseOrThrow } from '../middleware/validate.js'
import { assignmentListQuerySchema } from '../validators/dispatch.validator.js'

export async function getInsights(req, res) {
  const data = await analyticsService.getInsights({ actor: req.profile })
  return sendSuccess(res, data)
}

export async function getRegional(req, res) {
  const data = await analyticsService.getRegional({ actor: req.profile })
  return sendSuccess(res, data)
}

// ---- Module 17A/17B: regional officer duty dispatch (ADMIN-only) ----

export async function findOfficerMatches(req, res) {
  const data = await dispatchService.findOfficerMatches({ actor: req.profile, ...req.body })
  return sendSuccess(res, data)
}

export async function dispatchOfficers(req, res) {
  const data = await dispatchService.dispatchOfficers({ actor: req.profile, ...req.body })
  return sendSuccess(res, data, 201)
}

export async function listAssignments(req, res) {
  const query = parseOrThrow(assignmentListQuerySchema, req.query, 'query')
  const data = await dispatchService.listAssignments({ actor: req.profile, ...query })
  return sendSuccess(res, data)
}

export async function updateAssignmentStatus(req, res) {
  const data = await dispatchService.updateAssignmentStatus({
    actor: req.profile,
    assignmentId: req.params.id,
    status: req.body.status,
  })
  return sendSuccess(res, data)
}

export async function cancelAssignment(req, res) {
  const data = await dispatchService.cancelAssignment({ actor: req.profile, assignmentId: req.params.id })
  return sendSuccess(res, data)
}
