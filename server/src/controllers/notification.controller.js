import * as notificationService from '../services/notification.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function listNotifications(req, res) {
  const data = await notificationService.listNotifications({ userId: req.user.id })
  return sendSuccess(res, data)
}

export async function unreadCount(req, res) {
  const data = await notificationService.unreadCount({ userId: req.user.id })
  return sendSuccess(res, data)
}

export async function markNotificationRead(req, res) {
  const data = await notificationService.markNotificationRead({ userId: req.user.id, notificationId: req.params.id })
  return sendSuccess(res, data)
}

export async function markAllNotificationsRead(req, res) {
  const data = await notificationService.markAllNotificationsRead({ userId: req.user.id })
  return sendSuccess(res, data)
}