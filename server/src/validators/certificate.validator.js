// MODULE 12 — CERTIFICATE VALIDATORS
//
// Only the public verification code needs an HTTP-level shape check. The
// enrollment-id param reuses the existing enrollment schema (certificate
// lookup is keyed off the same frozen enrollment row).

import { z } from 'zod'

// Verification codes are server-issued identifiers. They must be short,
// alphanumeric+dash strings (CC-YYYY-NNNNNN or a preserved legacy id). We do
// NOT dictate the exact format here because historical numbers are preserved
// verbatim — any safe slug is accepted at the transport layer; the service is
// the authority on whether it exists.
export const verificationCodeParamSchema = z.object({
  verificationCode: z
    .string()
    .trim()
    .min(4, 'A verification code is required (at least 4 characters).')
    .max(64, 'A verification code cannot exceed 64 characters.')
    .regex(/^[A-Za-z0-9-]+$/, 'A verification code may only contain letters, numbers and dashes.'),
})