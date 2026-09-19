// MODULE 17 — NOTIFICATION REPOSITORY
//
// Ownership is ALWAYS enforced via `.eq('user_id', userId)` in every query; the
// service authorizes the actor and the repository never trusts a caller-supplied
// owner. Rows are returned as-is; the service owns the API projection.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

const NOTIFICATION_COLUMNS = 'id, user_id, broadcast_id, title, body, is_read, created_at'

function asNotificationError(operation, error) {
  return new ApiError(500, `NOTIFICATION_${operation.toUpperCase()}_UNEXPECTED`, 'The notification could not be processed. Please try again.', {
    dbCode: error?.code,
    dbMessage: error?.message,
  })
}

export async function listNotifications({ userId, limit = 50 }) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw asNotificationError('list', error)
  return data || []
}

export async function countUnread(userId) {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw asNotificationError('list', error)
  return count || 0
}

// Marks exactly one notification read, but ONLY when it belongs to the caller.
// A missing/foreign row returns null (the service turns that into 404 so the
// caller cannot distinguish "gone" from "not yours" beyond a generic not-found).
export async function markRead({ userId, notificationId }) {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw asNotificationError('update', error)
  return data || null
}

export async function markAllRead(userId) {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id', { count: 'exact', head: false })
  if (error) throw asNotificationError('update', error)
  return count || 0
}

// Canonical notification fan-out writer (used by the broadcast fan-out and the
// certificate-issue notice). Notifications carry their own title/body snapshot
// so they stay readable even if the source broadcast is later deleted. Bounded
// batches keep a single large fan-out from building one giant insert.
export async function insertNotifications(rows) {
  if (!rows.length) return 0
  const MAX_BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const { error } = await supabaseAdmin.from('notifications').insert(rows.slice(i, i + MAX_BATCH))
    if (error) throw asNotificationError('insert', error)
    inserted += Math.min(MAX_BATCH, rows.length - i)
  }
  return inserted
}