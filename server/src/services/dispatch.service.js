// MODULE 17A/17B — REGIONAL OFFICER DISPATCH SERVICE
//
// 17A: backend-authoritative eligibility and scoring for the Regional Officer
// Dispatch workflow that extends the Module 17 Regional Heatmap. An ADMIN picks
// a configured region and a required capability, and this service discovers the
// approved officers who genuinely hold that capability, ranks them from real
// persisted signals, and reports shortages honestly.
//
// 17B: the dispatch is now actually PERSISTENT. After re-running the same
// authoritative eligibility/matching checks, the selected officers are written
// to public.duty_assignments through a single atomic RPC (all-or-nothing), then
// each officer is notified through the existing Module 17 notification writer.
// Status changes follow a small, explicitly enforced state machine.
//
// Matching is the project's established engine (src/utils/matchingAlgorithm.js:
// domain 40%, feedback 20%, rating 20%, availability 10%, history 10%) restricted
// to the components that actually exist in the frozen schema. public.users has
// no rating or availability column, so those two legacy components are excluded
// and the surviving weights are renormalised — an unavailable signal is
// reported, never fabricated.

import { ApiError } from '../utils/apiResponse.js'
import * as repo from '../repositories/dispatch.repository.js'
import { insertNotifications } from '../repositories/notification.repository.js'

// Component weights carried over from src/utils/matchingAlgorithm.js.
export const MATCH_WEIGHTS = { domain: 0.4, feedback: 0.2, history: 0.1 }

// Legacy components with no column in the frozen schema.
export const UNAVAILABLE_SIGNALS = ['rating', 'availability']

// Mirrors the frontend engine's `Math.min(1, history / 5)` normalisation.
export const DUTY_HISTORY_TARGET = 5

// ---------------------------------------------------------------------------
// Duty-assignment state machine (17B)
// ---------------------------------------------------------------------------
export const DUTY_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
export const ACTIVE_DUTY_STATUSES = ['ASSIGNED', 'IN_PROGRESS']
export const DUTY_TRANSITIONS = {
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function canTransition(from, to) {
  if (!from || !to || from === to) return false
  return (DUTY_TRANSITIONS[from] || []).includes(to)
}

// De-duplicates a client-supplied officer list and reports any repeats so the
// service can reject them explicitly instead of silently collapsing them.
export function normalizeOfficerIds(ids) {
  const list = Array.isArray(ids) ? ids : []
  const unique = []
  const seen = new Set()
  const duplicates = []
  for (const id of list) {
    if (!id) continue
    if (seen.has(id)) {
      duplicates.push(id)
      continue
    }
    seen.add(id)
    unique.push(id)
  }
  return { unique, duplicates }
}

export function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
}

// Splits a free-text capability into comparable tokens (keeps #, +, . for
// technical terms like "C-Band" -> "c","band" and "MPLS/VPN" -> "mpls","vpn").
export function tokenizeCapability(capability) {
  return normalizeToken(capability)
    .split(/[^a-z0-9+#.]+/)
    .filter(Boolean)
}

// Fraction of capability tokens the officer's profile genuinely covers.
export function domainOverlap(officer, capability) {
  const capabilityTokens = tokenizeCapability(capability)
  if (!capabilityTokens.length) return 0
  const officerTokens = [
    ...(officer?.expertise || []),
    ...(officer?.specializations || []),
    ...(officer?.skills || []),
  ]
    .map(normalizeToken)
    .filter(Boolean)
  if (!officerTokens.length) return 0
  let overlap = 0
  for (const token of capabilityTokens) {
    if (officerTokens.some((t) => t === token || t.includes(token) || token.includes(t))) overlap += 1
  }
  return overlap / capabilityTokens.length
}

// Pure, DB-free scoring. `officer` carries feedbackAverage/dutyHistory (nullable).
export function computeOfficerMatch(officer, capability) {
  const domainScore = domainOverlap(officer, capability)
  const feedbackScore =
    officer?.feedbackAverage == null
      ? null
      : Math.min(1, Math.max(0, (Number(officer.feedbackAverage) - 1) / 4))
  const historyScore =
    officer?.dutyHistory == null ? null : Math.min(1, Number(officer.dutyHistory) / DUTY_HISTORY_TARGET)

  const components = [
    { key: 'domain', weight: MATCH_WEIGHTS.domain, value: domainScore },
    { key: 'feedback', weight: MATCH_WEIGHTS.feedback, value: feedbackScore },
    { key: 'history', weight: MATCH_WEIGHTS.history, value: historyScore },
  ]
  const usable = components.filter((c) => c.value !== null && c.value !== undefined)
  const totalWeight = usable.reduce((s, c) => s + c.weight, 0)
  const weighted = totalWeight
    ? usable.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight
    : 0

  const reasons = []
  if (domainScore > 0) {
    reasons.push(`Covers ${Math.round(domainScore * 100)}% of the required capability terms`)
  }
  if (feedbackScore !== null) {
    reasons.push(`Trainee feedback ${Number(officer.feedbackAverage).toFixed(1)}/5`)
  }
  if (historyScore !== null && Number(officer.dutyHistory) > 0) {
    reasons.push(`Authored ${Number(officer.dutyHistory)} course(s)`)
  }

  return {
    score: Math.round(weighted * 100),
    breakdown: {
      domain: Math.round(domainScore * 100),
      feedback: feedbackScore === null ? null : Math.round(feedbackScore * 100),
      history: historyScore === null ? null : Math.round(historyScore * 100),
    },
    reasons,
    unavailable: UNAVAILABLE_SIGNALS,
  }
}

function projectOfficer(officer, match) {
  return {
    id: officer.id,
    name: officer.name,
    role: officer.role,
    title: officer.title || null,
    station: officer.station || null,
    region: officer.region || null,
    yearsOfExperience: officer.years_of_experience || null,
    expertise: officer.expertise || [],
    specializations: officer.specializations || [],
    skills: officer.skills || [],
    match,
  }
}

// Safe API projection of a duty_assignments row. `byId` optionally carries
// { id -> { name, station } } summaries so the roster can show names without a
// second client round-trip. Internal metadata (created_at/updated_at/db ids
// beyond the officer/assigner ids) is not exposed.
export function mapAssignment(row, byId = new Map()) {
  if (!row) return null
  const officer = byId.get(row.officer_id) || {}
  const assigner = byId.get(row.assigned_by) || {}
  return {
    id: row.id,
    officerId: row.officer_id,
    officerName: officer.name || null,
    officerStation: officer.station || null,
    region: row.region,
    station: row.station ?? null,
    capability: row.capability,
    status: row.status,
    assignedById: row.assigned_by,
    assignedByName: assigner.name || null,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at ?? null,
    notes: row.notes ?? null,
  }
}

async function enrichAssignments(rows) {
  if (!rows.length) return []
  const summaries = await repo.fetchUserSummariesByIds(rows.flatMap((r) => [r.officer_id, r.assigned_by]))
  const byId = new Map(summaries.map((u) => [u.id, u]))
  return rows.map((row) => mapAssignment(row, byId))
}

function assertAdmin(actor) {
  if (!actor || actor.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only an ADMIN can dispatch regional officers.')
  }
}

// ---------------------------------------------------------------------------
// 17A — admin-only discovery + ranking
// ---------------------------------------------------------------------------
export async function findOfficerMatches({ actor, regionKey, capability, requiredCount } = {}) {
  assertAdmin(actor)

  const region = String(regionKey || '').trim()
  const cap = String(capability || '').trim()
  const need = Number.isInteger(requiredCount) && requiredCount > 0 ? requiredCount : 1

  const [regions, officers, feedback, history] = await Promise.all([
    repo.fetchRegionKeys(),
    repo.fetchApprovedOfficerProfiles(),
    repo.fetchTrainerFeedbackAverages(),
    repo.fetchTrainerDutyHistory(),
  ])

  const canonical = regions.find((r) => normalizeToken(r) === normalizeToken(region))
  if (!canonical) {
    throw new ApiError(400, 'INVALID_REGION', 'Unknown region. Choose one of the configured regions.', { regions })
  }

  const officersForRegion = officers.filter((o) => normalizeToken(o.region) === normalizeToken(canonical))
  const ranked = officersForRegion
    .map((officer) => {
      const enriched = {
        ...officer,
        feedbackAverage: feedback.get(officer.id) ?? null,
        dutyHistory: history.get(officer.id) ?? null,
      }
      return { officer: enriched, match: computeOfficerMatch(enriched, cap) }
    })
    .filter((entry) => entry.match.breakdown.domain > 0)
    .sort((a, b) => b.match.score - a.match.score || a.officer.name.localeCompare(b.officer.name))
    .map((entry) => projectOfficer(entry.officer, entry.match))

  return {
    regionKey: canonical,
    capability: cap,
    requiredCount: need,
    eligibleCount: ranked.length,
    shortage: ranked.length < need,
    shortfall: Math.max(0, need - ranked.length),
    officers: ranked,
    unavailableSignals: UNAVAILABLE_SIGNALS,
    generatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// 17B — admin-only persistent dispatch
// ---------------------------------------------------------------------------
// The client cannot bypass eligibility: the same findOfficerMatches() engine is
// re-run server-side and every selected id must appear in the eligible set.
export async function dispatchOfficers({ actor, regionKey, station, capability, requiredCount, officerIds, notes } = {}) {
  assertAdmin(actor)

  const matches = await findOfficerMatches({ actor, regionKey, capability, requiredCount })

  const { unique, duplicates } = normalizeOfficerIds(officerIds)
  if (duplicates.length) {
    throw new ApiError(400, 'DUPLICATE_OFFICERS', 'The same officer was selected more than once.', { duplicates })
  }
  if (!unique.length) {
    throw new ApiError(400, 'NO_OFFICERS_SELECTED', 'Select at least one officer to dispatch.')
  }
  if (unique.length > matches.requiredCount) {
    throw new ApiError(400, 'TOO_MANY_OFFICERS', 'Select no more officers than the requested count.', {
      requiredCount: matches.requiredCount,
    })
  }

  const eligible = new Set(matches.officers.map((o) => o.id))
  const ineligible = unique.filter((id) => !eligible.has(id))
  if (ineligible.length) {
    throw new ApiError(
      400,
      'OFFICER_NOT_ELIGIBLE',
      'One or more selected officers are not eligible for this capability in this region.',
      { ineligible },
    )
  }

  // Optional station must be a verified station inside the selected region.
  let resolvedStation = null
  if (station != null && String(station).trim() !== '') {
    const wanted = String(station).trim()
    const map = await repo.fetchStationRegionMap()
    const row = map.find((s) => normalizeToken(s.station) === normalizeToken(wanted))
    if (!row || normalizeToken(row.region) !== normalizeToken(matches.regionKey)) {
      throw new ApiError(400, 'INVALID_STATION', 'The selected station does not belong to this region.')
    }
    resolvedStation = row.station
  }

  // Pre-flight conflict check for a precise 409; the partial unique index is the
  // authoritative backstop under concurrency.
  const conflicts = await repo.findActiveAssignments({
    officerIds: unique,
    region: matches.regionKey,
    capability: matches.capability,
  })
  if (conflicts.length) {
    throw new ApiError(
      409,
      'DUTY_ASSIGNMENT_CONFLICT',
      'One or more selected officers already have an active assignment for this region and capability.',
      { officerIds: conflicts.map((a) => a.officer_id) },
    )
  }

  const rows = await repo.createDutyAssignments({
    officerIds: unique,
    region: matches.regionKey,
    station: resolvedStation,
    capability: matches.capability,
    assignedBy: actor.id,
    notes: notes ?? null,
  })
  if (!rows.length) {
    throw new ApiError(500, 'DISPATCH_CREATE_UNEXPECTED', 'The duty assignment could not be created. Please try again.')
  }

  const assignments = await enrichAssignments(rows)
  const notificationsSent = await notifyAssignedOfficers(assignments)

  return {
    regionKey: matches.regionKey,
    capability: matches.capability,
    assignments,
    notificationsSent,
  }
}

// Notifications happen ONLY after persistence has succeeded. A failed fan-out is
// logged but does not roll back a valid assignment (the assignment is the source
// of truth). Retries of the same dispatch cannot duplicate notifications because
// the persistence layer rejects the duplicate active assignment first.
async function notifyAssignedOfficers(assignments) {
  if (!assignments.length) return 0
  const rows = assignments.map((a) => ({
    user_id: a.officerId,
    title: 'Regional duty assignment',
    body: `You have been assigned for duty in ${a.region} Region for ${a.capability}.${
      a.station ? ` Station: ${a.station}.` : ''
    } Status: ${a.status}.`,
  }))
  try {
    return await insertNotifications(rows)
  } catch (err) {
    console.error(
      '[dispatch] assignments persisted but the notification fan-out failed:',
      err?.code || err?.message || err,
    )
    return 0
  }
}

// ---------------------------------------------------------------------------
// 17B — roster + status transitions
// ---------------------------------------------------------------------------
export async function listAssignments({ actor, region, capability, status, officerId, limit } = {}) {
  assertAdmin(actor)
  const rows = await repo.listDutyAssignments({ region, capability, status, officerId, limit })
  return { assignments: await enrichAssignments(rows) }
}

export async function updateAssignmentStatus({ actor, assignmentId, status } = {}) {
  assertAdmin(actor)

  const target = String(status || '').toUpperCase()
  if (!DUTY_STATUSES.includes(target)) {
    throw new ApiError(400, 'INVALID_STATUS', 'Unknown assignment status.', { allowed: DUTY_STATUSES })
  }

  const existing = await repo.getDutyAssignment(assignmentId)
  if (!existing) {
    throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'No such duty assignment exists.')
  }
  if (!canTransition(existing.status, target)) {
    throw new ApiError(
      400,
      'INVALID_STATUS_TRANSITION',
      `Cannot change status from ${existing.status} to ${target}.`,
      { from: existing.status, to: target },
    )
  }

  const updated = await repo.updateDutyAssignmentStatus({ id: assignmentId, status: target })
  if (!updated) {
    throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'No such duty assignment exists.')
  }
  const [assignment] = await enrichAssignments([updated])
  return { assignment }
}

export async function cancelAssignment({ actor, assignmentId } = {}) {
  return updateAssignmentStatus({ actor, assignmentId, status: 'CANCELLED' })
}
