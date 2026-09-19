// MODULE 17 — NOTIFICATION SERVICE
//
// A user may only read/filter/mark THEIR OWN notifications; every repository
// call is scoped by the authenticated user id. The API projection uses the
// notification's own title/body snapshot (they survive broadcast deletion).

import { ApiError } from '../utils/apiResponse.js'
import * as repo from '../repositories/notification.repository.js'

export function mapNotification(row) {
  if (!row) return null
  return {
    id: row.id,
    broadcastId: row.broadcast_id,
    title: row.title,
    body: row.body,
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}

export async function listNotifications({ userId }) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const rows = await repo.listNotifications({ userId })
  return { notifications: rows.map(mapNotification) }
}

export async function unreadCount({ userId }) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  return { count: await repo.countUnread(userId) }
}

export async function markNotificationRead({ userId, notificationId }) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  const updated = await repo.markRead({ userId, notificationId })
  if (!updated) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'No such notification exists for this account.')
  return { id: updated.id, isRead: true }
}

export async function markAllNotificationsRead({ userId }) {
  if (!userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.')
  return { updatedCount: await repo.markAllRead(userId) }
}