// MODULE 17A/17B — REGIONAL OFFICER DISPATCH (DEVELOPMENT/MOCK PATH)
//
// Mirrors the backend-authoritative dispatch service (server/src/services/
// dispatch.service.js) purely in memory for DEV/demo sessions. Same response
// shapes, same eligibility + scoring semantics (domain 40% / feedback 20% /
// history 10%, renormalised over the signals that exist), same persisted
// duty-assignment state machine. No localStorage: the roster resets on reload,
// exactly like the rest of the mock layer.
//
// Real (Supabase) sessions normally never touch this module —
// OfficerDispatchPanel swaps it for analyticsApi when the backend is active.
// Exception: with VITE_DEMO_MODE=true, a REAL admin still routes through this
// in-memory mirror (read-only demo surface) so fake officers are never written
// to the real duty-assignment table.

import { getAllUsers } from './userService'
import { stationRegionMap } from '../data/mockData'

const REGION_KEYS = ['North', 'West', 'East', 'South']
const DUTY_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const DUTY_TRANSITIONS = {
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

const MATCH_WEIGHTS = { domain: 0.4, feedback: 0.2, history: 0.1 }
const UNAVAILABLE_SIGNALS = ['rating', 'availability']
const DUTY_HISTORY_TARGET = 5

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function tokenizeCapability(capability) {
  return normalizeToken(capability)
    .split(/[^a-z0-9+#.]+/)
    .filter(Boolean)
}

// Fraction of capability tokens the officer's profile genuinely covers.
function domainOverlap(officer, capability) {
  const tokens = tokenizeCapability(capability)
  if (!tokens.length) return 0
  const officerTokens = [...(officer.expertise || []), ...(officer.specializations || []), ...(officer.skills || [])]
    .map(normalizeToken)
    .filter(Boolean)
  if (!officerTokens.length) return 0
  let overlap = 0
  for (const token of tokens) {
    if (officerTokens.some((t) => t === token || t.includes(token) || token.includes(t))) overlap += 1
  }
  return overlap / tokens.length
}

// Seeded, deterministic feedback/history so the demo matcher shows the same
// stable breakdown for an officer/capability every load (mirrors the backend's
// persisted aggregates — no Math.random).
function seedSignalFor(id, field) {
  let hash = 0
  for (const ch of String(id || '')) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const n = Math.abs(hash)
  if (field === 'feedback') return 3.8 + (n % 11) * 0.1 // 3.8 .. 4.8
  return n % 4 // 0 .. 3 prior duties
}

export function computeOfficerMatch(officer, capability) {
  const domainScore = domainOverlap(officer, capability)
  const feedbackScore = Math.min(1, Math.max(0, (seedSignalFor(officer.id, 'feedback') - 1) / 4))
  const historyScore = Math.min(1, seedSignalFor(officer.id, 'history') / DUTY_HISTORY_TARGET)

  const components = [
    { key: 'domain', weight: MATCH_WEIGHTS.domain, value: domainScore },
    { key: 'feedback', weight: MATCH_WEIGHTS.feedback, value: feedbackScore },
    { key: 'history', weight: MATCH_WEIGHTS.history, value: historyScore },
  ]
  const usable = components.filter((c) => c.value !== null && c.value !== undefined)
  const totalWeight = usable.reduce((s, c) => s + c.weight, 0)
  const weighted = totalWeight ? usable.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight : 0

  const reasons = []
  if (domainScore > 0) reasons.push(`Covers ${Math.round(domainScore * 100)}% of the required capability terms`)
  if (feedbackScore !== null) reasons.push(`Trainee feedback ${seedSignalFor(officer.id, 'feedback').toFixed(1)}/5`)
  if (historyScore !== null && seedSignalFor(officer.id, 'history') > 0) {
    reasons.push(`Authored ${seedSignalFor(officer.id, 'history')} course(s)`)
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

function projectOfficer(user, match) {
  return {
    id: user.uid,
    name: user.fullName || user.name,
    role: user.role,
    title: user.title || null,
    station: user.station || null,
    region: user.region || null,
    yearsOfExperience: user.yearsOfExperience || null,
    expertise: user.expertise || [],
    specializations: user.specializations || [],
    skills: user.skills || [],
    match,
  }
}

// In-memory duty-assignment roster (demo only). Pre-seeded so the admin demo
// opens to a realistic regional roster without a first dispatch.
const MOCK_ASSIGNMENTS = new Map()
let assignmentSeq = 0

function normalizeMapRow(row) {
  return {
    id: row.id,
    officerId: row.officerId,
    officerName: row.officerName,
    officerStation: row.officerStation,
    region: row.region,
    station: row.station,
    capability: row.capability,
    status: row.status,
    assignedById: row.assignedById,
    assignedByName: row.assignedByName,
    assignedAt: row.assignedAt,
    completedAt: row.completedAt,
    notes: row.notes,
  }
}

async function approvedOfficerProfiles() {
  const all = await getAllUsers()
  return all.filter((u) => String(u.approvalStatus || '').toUpperCase() === 'APPROVED')
}

export async function findOfficerMatches({ regionKey, capability, requiredCount } = {}) {
  const region = String(regionKey || '').trim()
  const cap = String(capability || '').trim()
  const need = Number.isInteger(requiredCount) && requiredCount > 0 ? requiredCount : 1

  const canonical = REGION_KEYS.find((r) => normalizeToken(r) === normalizeToken(region))
  if (!canonical) {
    throw new Error('Unknown region. Choose one of the configured regions.')
  }

  const officers = await approvedOfficerProfiles()
  const forRegion = officers.filter((o) => normalizeToken(o.region) === normalizeToken(canonical))
  const ranked = forRegion
    .map((officer) => ({ officer, match: computeOfficerMatch(officer, cap) }))
    .filter((entry) => entry.match.breakdown.domain > 0)
    .sort(
      (a, b) =>
        b.match.score - a.match.score ||
        String(a.officer.fullName || a.officer.name || '').localeCompare(String(b.officer.fullName || b.officer.name || '')),
    )
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

export async function dispatchOfficers({ regionKey, capability, requiredCount, station, officerIds, notes } = {}) {
  const matches = await findOfficerMatches({ regionKey, capability, requiredCount })

  const unique = Array.from(new Set((Array.isArray(officerIds) ? officerIds : []).filter(Boolean)))
  if (!unique.length) throw new Error('Select at least one officer to dispatch.')
  if (unique.length > matches.requiredCount) throw new Error('Select no more officers than the requested count.')

  const eligible = new Set(matches.officers.map((o) => o.id))
  const ineligible = unique.filter((id) => !eligible.has(id))
  if (ineligible.length) throw new Error('One or more selected officers are not eligible for this capability in this region.')

  let resolvedStation = null
  if (station != null && String(station).trim() !== '') {
    const wanted = String(station).trim()
    const row = stationRegionMap[wanted]
    if (!row || normalizeToken(row) !== normalizeToken(matches.regionKey)) {
      throw new Error('The selected station does not belong to this region.')
    }
    resolvedStation = wanted
  }

  const now = new Date().toISOString()
  const assignments = []
  for (const officerId of unique) {
    const officer = matches.officers.find((o) => o.id === officerId)
    if (!officer) continue
    assignmentSeq += 1
    const row = {
      id: `da-${assignmentSeq}`,
      officerId,
      officerName: officer.name,
      officerStation: officer.station,
      region: matches.regionKey,
      station: resolvedStation,
      capability: matches.capability,
      status: 'ASSIGNED',
      assignedById: 'u3',
      assignedByName: 'Rajesh Verma',
      assignedAt: now,
      completedAt: null,
      notes: notes || null,
    }
    MOCK_ASSIGNMENTS.set(row.id, row)
    assignments.push(normalizeMapRow(row))
  }

  return {
    regionKey: matches.regionKey,
    capability: matches.capability,
    assignments,
    notificationsSent: assignments.length,
  }
}

export async function listAssignments({ region, capability, status, officerId, limit } = {}) {
  let rows = [...MOCK_ASSIGNMENTS.values()]
  if (region) rows = rows.filter((a) => normalizeToken(a.region) === normalizeToken(region))
  if (capability) rows = rows.filter((a) => normalizeToken(a.capability) === normalizeToken(capability))
  if (status) rows = rows.filter((a) => normalizeToken(a.status) === normalizeToken(status))
  if (officerId) rows = rows.filter((a) => a.officerId === officerId)
  if (Number.isInteger(limit) && limit > 0) rows = rows.slice(0, limit)
  return { assignments: rows.map(normalizeMapRow) }
}

export async function updateAssignmentStatus(assignmentId, status) {
  const target = String(status || '').toUpperCase()
  if (!DUTY_STATUSES.includes(target)) throw new Error('Unknown assignment status.')

  const existing = MOCK_ASSIGNMENTS.get(assignmentId)
  if (!existing) throw new Error('No such duty assignment exists.')
  if (!DUTY_TRANSITIONS[existing.status]?.includes(target)) {
    throw new Error(`Cannot change status from ${existing.status} to ${target}.`)
  }

  const updated = {
    ...existing,
    status: target,
    completedAt: target === 'COMPLETED' || target === 'CANCELLED' ? new Date().toISOString() : existing.completedAt,
  }
  MOCK_ASSIGNMENTS.set(assignmentId, updated)
  return { assignment: normalizeMapRow(updated) }
}

export async function cancelAssignment(assignmentId) {
  return updateAssignmentStatus(assignmentId, 'CANCELLED')
}

// ------------------------- SEEDED ROSTER (demo) -------------------------
// Five pre-existing regional assignments so the admin demo opens with a live
// roster (not 0) in EVERY region — including East, the default view — plus
// matchable capabilities in flight. Each officer/capability pair is consistent
// with that person's seeded profile, station and region in mockData.js.
assignmentSeq += 1
MOCK_ASSIGNMENTS.set('da-1', {
  id: 'da-1',
  officerId: 'u10',
  officerName: 'Pooja Singh',
  officerStation: 'Jaipur',
  region: 'North',
  station: 'Jaipur',
  capability: 'Severe Weather Forecasting',
  status: 'IN_PROGRESS',
  assignedById: 'u3',
  assignedByName: 'Rajesh Verma',
  assignedAt: new Date('2026-08-22T09:30:00Z').toISOString(),
  completedAt: null,
  notes: 'Duststorm and thunderstorm outlook support — North Region.',
})
assignmentSeq += 1
MOCK_ASSIGNMENTS.set('da-2', {
  id: 'da-2',
  officerId: 'u2',
  officerName: 'Dr. Priya Menon',
  officerStation: 'Pune',
  region: 'West',
  station: 'Pune',
  capability: 'Numerical Weather Prediction',
  status: 'COMPLETED',
  assignedById: 'u3',
  assignedByName: 'Rajesh Verma',
  assignedAt: new Date('2026-08-01T08:00:00Z').toISOString(),
  completedAt: new Date('2026-08-20T12:00:00Z').toISOString(),
  notes: 'Monsoon ensemble guidance for the Konkan belt.',
})
assignmentSeq += 1
MOCK_ASSIGNMENTS.set('da-3', {
  id: 'da-3',
  officerId: 'u7',
  officerName: 'Dr. Vikram Rao',
  officerStation: 'Hyderabad',
  region: 'South',
  station: 'Hyderabad',
  capability: 'Numerical Weather Prediction',
  status: 'ASSIGNED',
  assignedById: 'u3',
  assignedByName: 'Rajesh Verma',
  assignedAt: new Date('2026-08-24T10:00:00Z').toISOString(),
  completedAt: null,
  notes: 'Arabian Sea cyclone season rotation.',
})
assignmentSeq += 1
MOCK_ASSIGNMENTS.set('da-4', {
  id: 'da-4',
  officerId: 'u6',
  officerName: 'Dr. Suman Bhattacharya',
  officerStation: 'Kolkata',
  region: 'East',
  station: 'Kolkata',
  capability: 'Flood Forecasting',
  status: 'IN_PROGRESS',
  assignedById: 'u3',
  assignedByName: 'Rajesh Verma',
  assignedAt: new Date('2026-08-25T06:45:00Z').toISOString(),
  completedAt: null,
  notes: 'Brahmaputra flood watch support — East Region.',
})
assignmentSeq += 1
MOCK_ASSIGNMENTS.set('da-5', {
  id: 'da-5',
  officerId: 'u9',
  officerName: 'Rohan Deshmukh',
  officerStation: 'Pune',
  region: 'West',
  station: 'Pune',
  capability: 'Radar Meteorology',
  status: 'ASSIGNED',
  assignedById: 'u3',
  assignedByName: 'Rajesh Verma',
  assignedAt: new Date('2026-08-26T11:15:00Z').toISOString(),
  completedAt: null,
  notes: 'Radar-mixed NWP verification support.',
})