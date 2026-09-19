import * as broadcastService from '../services/broadcast.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function createBroadcast(req, res) {
  // POST /api/broadcasts — ADMIN (any audience) or APPROVED TRAINER (owned course
  // only). req.profile is set by authorize(); ownership is re-checked in the service.
  const data = await broadcastService.createBroadcast({ actor: req.profile, payload: req.body })
  return sendSuccess(res, data, 201)
}

export async function listBroadcasts(req, res) {
  // GET /api/broadcasts — any authenticated user; scoping enforced in the service.
  const actor = req.profile || req.user
  const data = await broadcastService.listBroadcasts({ actor })
  return sendSuccess(res, data)
}

export async function deleteBroadcast(req, res) {
  // DELETE /api/broadcasts/:id — ADMIN only.
  const data = await broadcastService.deleteBroadcast({ actor: req.profile, id: req.params.id })
  return sendSuccess(res, data)
}