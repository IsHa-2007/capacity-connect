// MODULE 17 — NOTIFICATION VALIDATORS
//
// Notifications are read-only to the owner: the only client-mutable field is
// `is_read` on the caller's OWN rows. Route params are UUID-gated so a malformed
// identifier can never reach the service (matching the m16 course-id contract).

import { z } from 'zod'

export const notificationIdParamSchema = z.object({ id: z.string().uuid('Invalid identifier.') })