// MODULE 17 — BROADCAST API SERVICE (frontend)
//
// Talks to the backend /api/broadcasts endpoints. The backend owns delivery and
// audience resolution (role + region/station/course scoping) and fans a
// notification out to each recipient; this client only maps UI-friendly fields
// to the whitelisted create payload and back. Identity never travels from here:
// createdBy and every timestamp are assigned server-side.
//
// The UI models "audience" as a preset choice (all-trainees / all-trainers /
// region / station / group). The backend models addressable scope as a role
// array plus an optional region/station/course filter, so the helpers below are
// the single translation point between the two.

import { api, getAccessToken } from './api'

const withToken = () => ({ token: getAccessToken() })

// Preset audience ids -> role arrays understood by the backend.
export const AUDIENCE_ROLES = {
  'all-trainees': ['trainee'],
  'all-trainers': ['trainer'],
  region: ['trainee', 'trainer'],
  station: ['trainee', 'trainer'],
  group: ['trainee', 'trainer'],
}

export const AUDIENCE_LABELS = {
  'all-trainees': 'All Trainees',
  'all-trainers': 'All Trainers',
}

// Human region label used by the form -> canonical seed region key.
const REGION_KEYS = {
  'Northern Region': 'North',
  'Western Region': 'West',
  'Eastern Region': 'East',
  'Southern Region': 'South',
  North: 'North',
  West: 'West',
  East: 'East',
  South: 'South',
}

export function regionKey(label) {
  return REGION_KEYS[label] || 'North'
}

export function audienceKeyFor(roles = []) {
  const hasTrainee = roles.includes('trainee')
  const hasTrainer = roles.includes('trainer')
  if (hasTrainee && hasTrainer) return 'all'
  if (hasTrainer) return 'all-trainers'
  if (hasTrainee) return 'all-trainees'
  return 'all'
}

// Converts the BroadcastCenter form into the strict create payload the backend
// accepts. Extra UI-only fields (audienceKey/audienceLabel) are never sent.
export function toCreatePayload(form) {
  const preset = form.audience || 'all-trainees'
  const payload = {
    title: String(form.title || '').trim(),
    body: String(form.body || '').trim(),
    audience: AUDIENCE_ROLES[preset] || ['trainee'],
    type: form.type || 'Training announcement',
    label: form.audienceLabel || AUDIENCE_LABELS[preset] || 'All Trainees',
  }
  if (preset === 'region') payload.region = regionKey(form.region)
  if (preset === 'station') payload.station = form.station
  return payload
}

// Maps a backend broadcast row to the shape BroadcastCenter/Navbar render.
export function mapBroadcastFromApi(b = {}) {
  const roles = Array.isArray(b.audience) ? b.audience : []
  return {
    id: b.id,
    title: b.title || '',
    body: b.body || '',
    audience: roles,
    audienceKey: audienceKeyFor(roles),
    audienceLabel: b.label || AUDIENCE_LABELS[audienceKeyFor(roles)] || roles.join(' · '),
    type: b.type || 'Training announcement',
    region: b.region || '',
    station: b.station || '',
    courseId: b.courseId || null,
    date: b.createdAt ? String(b.createdAt).slice(0, 10) : '',
    published: true,
  }
}

export async function listBroadcasts() {
  const data = await api.get('/broadcasts', withToken())
  return Array.isArray(data?.broadcasts) ? data.broadcasts.map(mapBroadcastFromApi) : []
}

// Returns the backend create result: { broadcast, deliveredCount }.
export async function createBroadcast(form) {
  const data = await api.post('/broadcasts', toCreatePayload(form), withToken())
  return {
    broadcast: data?.broadcast ? mapBroadcastFromApi(data.broadcast) : null,
    deliveredCount: data?.deliveredCount ?? 0,
  }
}

export async function deleteBroadcast(id) {
  return api.del(`/broadcasts/${encodeURIComponent(id)}`, withToken())
}
