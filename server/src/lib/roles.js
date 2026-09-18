// Module 8 ??" ROLES & APPROVAL SHARED CONSTANTS
//
// This is the SINGLE canonical source of role/approval constants for the
// course & question-bank modules. It re-exports the SAME canonical RBAC
// contract that `middleware/authorize.js` enforces (ROLES + APPROVAL_STATUSES)
// and maps them to the constants `course.service.js` imports:
//
//   import { ROLE_TRAINER, ROLE_ADMIN, isApproved } from '../lib/roles.js'
//
// The actor shape this helper family operates on is the hydrated profile
// returned by user.repository `findProfileById` (via authorize.js):
// `{ id, role, approvalStatus, ... }` (camelCase). NEVER invent a second RBAC
// here ??" if the canonical middleware changes, these re-exports change with it.

import { ROLES, APPROVAL_STATUSES } from '../middleware/authorize.js'

export { ROLES, APPROVAL_STATUSES }

export const ROLE_ADMIN = 'ADMIN'
export const ROLE_TRAINER = 'TRAINER'
export const ROLE_TRAINEE = 'TRAINEE'

/**
 * @param {{role?: string, approvalStatus?: string}} actor Hydrated profile row
 * @returns {boolean} true when the actor is a fully APPROVED ADMIN/TRAINER.
 */
export function isApproved(actor) {
  return Boolean(
    actor &&
      (actor.role === ROLE_TRAINER || actor.role === ROLE_ADMIN) &&
      actor.approvalStatus === 'APPROVED',
  )
}
