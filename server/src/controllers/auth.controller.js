import * as authService from '../services/auth.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function register(req, res) {
  const data = await authService.register(req.body)
  return sendSuccess(res, data, 201)
}

export async function login(req, res) {
  const data = await authService.login(req.body)
  return sendSuccess(res, data)
}

export async function logout(req, res) {
  await authService.logout(req.authToken)
  return sendSuccess(res, null, 200, 'Signed out successfully.')
}

export async function getMe(req, res) {
  const data = await authService.getCurrentUser(req.authToken)
  return sendSuccess(res, data)
}