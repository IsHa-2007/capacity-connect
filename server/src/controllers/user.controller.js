import * as userService from '../services/user.service.js'
import * as certificationService from '../services/userCertification.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function getMe(req, res) {
  const data = await userService.getMe(req.user.id)
  return sendSuccess(res, data)
}

export async function updateMe(req, res) {
  const data = await userService.updateMe(req.user.id, req.body)
  return sendSuccess(res, data)
}

export async function listUsers(req, res) {
  const data = await userService.listUsers()
  return sendSuccess(res, data)
}

export async function searchUsers(req, res) {
  const data = await userService.searchUsers(req.query?.q)
  return sendSuccess(res, data)
}

export async function getUser(req, res) {
  const data = await userService.getUserById(req.params.id, req.user.id)
  return sendSuccess(res, data)
}

export async function changeRole(req, res) {
  const data = await userService.changeUserRole(req.params.id, req.body.role)
  return sendSuccess(res, data)
}

export async function changeApproval(req, res) {
  const data = await userService.changeApprovalStatus(req.params.id, req.body.approvalStatus)
  return sendSuccess(res, data)
}

// ---- Module 17: self-added professional certifications (user_certifications) ----

export async function listMyCertifications(req, res) {
  const data = await certificationService.listMyCertifications(req.user.id)
  return sendSuccess(res, data)
}

export async function addCertification(req, res) {
  const data = await certificationService.addCertification(req.user.id, req.body)
  return sendSuccess(res, data, 201)
}

export async function updateCertification(req, res) {
  const data = await certificationService.updateMyCertification(req.user.id, req.params.id, req.body)
  return sendSuccess(res, data)
}

export async function removeCertification(req, res) {
  const data = await certificationService.removeMyCertification(req.user.id, req.params.id)
  return sendSuccess(res, data)
}

export async function getUserCertifications(req, res) {
  const data = await certificationService.getUserCertifications(req.params.id, req.user.id)
  return sendSuccess(res, data)
}