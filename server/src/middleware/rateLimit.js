// MODULE 16 — RATE LIMITING
//
// Small per-IP, in-memory limits for the sensitive / unauthenticated endpoints.
// Limits are deliberately generous for a small internal pilot (the real
// barrier is authentication + RBAC on the data layer), but they stop naive
// brute-force loops on login/register and abusive enumeration of the PUBLIC
// certificate-verification endpoint. Responses use the established
// { success: false, error: { code, message } } shape so clients can surface a
// safe `RATE_LIMITED` message.
//
// NOTE: the built-in memory store is per-process only. It is documented as a
// known limitation for multi-instance deployments (see Module 16 report).

import { rateLimit } from 'express-rate-limit'
import { sendError } from '../utils/apiResponse.js'

const FIFTEEN_MINUTES = 15 * 60 * 1000

function tooManyRequests(message) {
  return (_req, res) =>
    sendError(res, {
      status: 429,
      code: 'RATE_LIMITED',
      message,
    })
}

// POST /auth/login — credential attempt guard.
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooManyRequests('Too many sign-in attempts. Please wait a few minutes and try again.'),
})

// POST /auth/register — account-creation guard.
export const registerLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooManyRequests('Too many sign-up attempts. Please wait a few minutes and try again.'),
})

// PUBLIC GET /certificates/verify/:code — guards against enumeration.
export const verifyLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooManyRequests('Too many verification requests. Please slow down and try again shortly.'),
})