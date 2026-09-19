// MODULE 17 — ANALYTICS API SERVICE (frontend)
//
// Admin-only backend analytics. /analytics/insights returns the real platform
// summary + per-course rows; /analytics/regional returns the station/region
// competency model. Both are gated by ADMIN on the server (authorize + approved),
// so this client never sends a role and simply surfaces whatever the backend
// authorises.

import { api, getAccessToken } from './api'

const withToken = () => ({ token: getAccessToken() })

export async function getInsights() {
  const data = await api.get('/analytics/insights', withToken())
  return data || { summary: {}, courses: [] }
}

export async function getRegional() {
  const data = await api.get('/analytics/regional', withToken())
  return data || { regions: [], stations: [], generatedAt: null }
}

// MODULE 17A — regional officer dispatch (ADMIN-only, backend-authoritative).
// The payload carries only the requirement (region/capability/count) and, for a
// dispatch, the selected officer ids; eligibility and scores are always decided
// by the backend.
export async function findOfficerMatches({ regionKey, capability, requiredCount }) {
  return api.post(
    '/analytics/regional/officer-matches',
    { regionKey, capability, requiredCount },
    withToken(),
  )
}

export async function dispatchOfficers({ regionKey, capability, requiredCount, station, officerIds, notes }) {
  return api.post(
    '/analytics/regional/dispatch',
    { regionKey, capability, requiredCount, station, officerIds, notes },
    withToken(),
  )
}

// MODULE 17B — persisted duty assignment roster + state transitions. All are
// ADMIN-only and backend-authoritative; the client only supplies filters/ids.
export async function listAssignments({ region, capability, status, officerId, limit } = {}) {
  const params = new URLSearchParams()
  if (region) params.set('region', region)
  if (capability) params.set('capability', capability)
  if (status) params.set('status', status)
  if (officerId) params.set('officerId', officerId)
  if (limit) params.set('limit', String(limit))
  const qs = params.toString()
  const data = await api.get(`/analytics/regional/assignments${qs ? `?${qs}` : ''}`, withToken())
  return data || { assignments: [] }
}

export async function updateAssignmentStatus(assignmentId, status) {
  return api.patch(`/analytics/regional/assignments/${assignmentId}/status`, { status }, withToken())
}

export async function cancelAssignment(assignmentId) {
  return api.post(`/analytics/regional/assignments/${assignmentId}/cancel`, {}, withToken())
}
