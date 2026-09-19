import { z } from 'zod'

// MODULE 17A/17B — REGIONAL OFFICER DISPATCH VALIDATORS
//
// Strict request contracts for the ADMIN-only regional dispatch surface. The
// capability is free text compared against real user profile arrays; region,
// station and officer identity are re-validated against persisted rows in the
// service (the frontend is never trusted). Unknown fields are rejected
// (`.strict()`), so a client cannot smuggle identity/ownership keys into the
// request.

const regionKey = z
  .string()
  .trim()
  .min(1, 'Region is required.')
  .max(60, 'Region is invalid.')

const capability = z
  .string()
  .trim()
  .min(1, 'Capability is required.')
  .max(120, 'Capability must be at most 120 characters.')

const station = z.string().trim().max(120, 'Station is invalid.')

const requiredCount = z.coerce
  .number()
  .int('Required count must be a whole number.')
  .min(1, 'At least one officer is required.')
  .max(50, 'At most 50 officers can be requested at once.')

export const DUTY_ASSIGNMENT_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

export const officerMatchSchema = z
  .object({
    regionKey,
    capability,
    requiredCount: requiredCount.default(1),
  })
  .strict()

export const officerDispatchSchema = z
  .object({
    regionKey,
    capability,
    requiredCount: requiredCount.default(1),
    station: station.optional(),
    officerIds: z
      .array(z.string().uuid('Invalid officer identifier.'))
      .min(1, 'Select at least one officer.')
      .max(50, 'Too many officers selected.'),
    notes: z.string().trim().max(1000, 'Notes must be at most 1000 characters.').optional(),
  })
  .strict()

// Query contract for the roster. Kept separate because Express 5 exposes
// req.query as a getter; the controller parses it explicitly (see analytics
// controller) rather than through the body-assigning `validate` middleware.
export const assignmentListQuerySchema = z
  .object({
    region: regionKey.optional(),
    capability: capability.optional(),
    status: z.enum(DUTY_ASSIGNMENT_STATUSES).optional(),
    officerId: z.string().uuid('Invalid officer identifier.').optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict()

export const assignmentIdParamSchema = z
  .object({ id: z.string().uuid('Invalid assignment identifier.') })
  .strict()

export const assignmentStatusSchema = z
  .object({ status: z.enum(DUTY_ASSIGNMENT_STATUSES) })
  .strict()
