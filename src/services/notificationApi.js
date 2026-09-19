// MODULE 17 — NOTIFICATION API SERVICE (frontend)
//
// Reads the backend-generated notifications for the authenticated user and
// toggles their read state. The backend only ever returns rows owned by the
// caller (scoped by the access token), so this client never passes a user id.
// Notifications are created server-side when a broadcast is sent and when a
// certificate is issued.

import { api, getAccessToken } from './api'

const withToken = () => ({ token: getAccessToken() })

export function mapNotificationFromApi(n = {}) {
  return {
    id: n.id,
    broadcastId: n.broadcastId || null,
    title: n.title || '',
    body: n.body || '',
    isRead: Boolean(n.isRead),
    createdAt: n.createdAt || '',
  }
}

export async function listNotifications() {
  const data = await api.get('/notifications', withToken())
  return Array.isArray(data?.notifications) ? data.notifications.map(mapNotificationFromApi) : []
}

export async function getUnreadCount() {
  const data = await api.get('/notifications/unread-count', withToken())
  return Number(data?.count || 0)
}

export async function markNotificationRead(id) {
  return api.patch(`/notifications/${encodeURIComponent(id)}/read`, {}, withToken())
}

export async function markAllNotificationsRead() {
  return api.patch('/notifications/read-all', {}, withToken())
}
