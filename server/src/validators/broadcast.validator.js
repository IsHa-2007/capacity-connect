// MODULE 17 — BROADCAST VALIDATORS
//
// Whitelist for creating and addressing broadcasts. Every addressable field maps
// to public.broadcasts / its legacy_raw JSONB:
//   audience   -> broadcasts.audience TEXT[]   (roles the notice may reach)
//   type       -> legacy_raw.type             (display category, never queried)
//   region     -> legacy_raw.region           (North/West/East/South filter)
//   station    -> legacy_raw.station          (exact station filter)
//   courseId   -> broadcasts.course_id        (course-linked delivery)
//   label      -> legacy_raw.label            (human audience label for the UI)
//
// Identity/permission fields (createdBy, id, createdAt, ...) are deliberately
// absent: zod strips them before the service sees the payload, and the strict
// mode below also rejects any alien key the frontend is NOT allowed to send.

import { z } from 'zod'

export const BROADCAST_REGIONS = ['North', 'West', 'East', 'South'] // Station regions (schema seed)
export const BROADCAST_TYPES = [
  'Training announcement',
  'Urgent update',
  'Policy change',
  'New course availability',
  'Operational notice',
]
export const BROADCAST_ROLES = ['trainee', 'trainer']

const uuid = z.string().uuid('Invalid identifier.')

export const createBroadcastSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required.')
      .max(200, 'Title must be at most 200 characters.'),
    body: z
      .string()
      .trim()
      .min(1, 'Message is required.')
      .max(2000, 'Message must be at most 2000 characters.'),
    audience: z
      .array(z.enum(BROADCAST_ROLES))
      .min(1, 'Select at least one audience role.')
      .max(BROADCAST_ROLES.length, 'Invalid audience.'),
    type: z.enum(BROADCAST_TYPES).default('Training announcement'),
    region: z.enum(BROADCAST_REGIONS).nullish(),
    station: z.string().trim().max(100, 'Station must be at most 100 characters.').nullish(),
    courseId: uuid.nullish(),
    label: z.string().trim().max(200, 'Audience label is too long.').nullish(),
  })
  .strict()

export const broadcastIdParamSchema = z.object({ id: uuid })