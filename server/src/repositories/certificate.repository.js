// MODULE 12 — CERTIFICATE REPOSITORY (Supabase / PostgreSQL)
//
// Thin data-access layer over the FROZEN public.certificates relation
// (created by the initial-schema migration, NOT added in this module):
//
//   certificates: id, enrollment_id (UNIQUE), user_id, course_id,
//                 certificate_number (UNIQUE), legacy_certificate_id,
//                 issued_on, issued_by, created_at
//
// The module never invents columns, never writes to enrollments, and never
// owns RBAC. All authorization/eligibility rules live in the certificate
// SERVICE — this repository is deliberately auth-agnostic (same convention as
// enrollment.repository.js / course.repository.js).
//
// Numbering is deferred here on purpose: the service computes CC-YYYY-NNNNNN
// with a concurrency-safe retry loop (never COUNT(*) — see the migration note),
// and this layer only reads what actually exists so the service can derive the
// next number and repair on a UNIQUE violation.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

export const CERTIFICATES_BASE = `
  id, enrollment_id, user_id, course_id,
  certificate_number, legacy_certificate_id,
  issued_on, issued_by, created_at
`

// Enriched list select: joins the owning user's display name, the enrollment's
// assessment percentage + status, and the course title/domain in ONE query so
// profile sync and trainer/admin certificate lists never fan out per-row.
export const CERTIFICATES_LIST_SELECT = `
  id, enrollment_id, user_id, course_id, certificate_number,
  legacy_certificate_id, issued_on, issued_by, created_at,
  users ( name ),
  enrollments ( assessment_percentage, status ),
  courses ( title, domain )
`

// ---------------------------------------------------------------------------
// ROW MAPPER (snake_case DB → camelCase API, mirroring mapEnrollmentRow)
// ---------------------------------------------------------------------------

export function mapCertificateRow(row) {
  if (!row) return null
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    userId: row.user_id,
    courseId: row.course_id,
    certificateNumber: row.certificate_number,
    legacyCertificateId: row.legacy_certificate_id ?? null,
    issuedOn: row.issued_on,
    issuedBy: row.issued_by ?? null,
    createdAt: row.created_at,
  }
}

// Enriched list item (profile sync + trainer/admin certificate lists). The
// joined relations are scalar objects (or null) from supabase-js embedded
// selects; both single-object and array shapes are normalized to be safe.
function joined(row, key) {
  const value = row?.[key]
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

export function mapCertificateListItem(row) {
  if (!row) return null
  const base = mapCertificateRow(row)
  if (!base) return null
  const user = joined(row, 'users')
  const enrollment = joined(row, 'enrollments')
  const course = joined(row, 'courses')
  return {
    ...base,
    traineeName: user?.name ?? null,
    score: enrollment?.assessment_percentage ?? null,
    completionStatus: enrollment?.status ?? null,
    courseTitle: course?.title ?? null,
    courseDomain: course?.domain ?? null,
  }
}

// ---------------------------------------------------------------------------
// ERROR MAPPING (mirrors the enrollment/course repository error triage)
// ---------------------------------------------------------------------------

function asCertificateError(operation, error) {
  const code = error?.code

  if (code === '42P01' || /relation .*certificates.*does not exist/i.test(error?.message || '')) {
    return new ApiError(503, 'CERTIFICATE_UNAVAILABLE', 'The certificate storage is not ready yet.', { dbCode: code })
  }
  if (code === '23505') {
    return new ApiError(409, 'CERTIFICATE_CONFLICT', 'A certificate for this enrollment already exists.', { dbCode: code })
  }
  if (code === '23503') {
    return new ApiError(400, 'CERTIFICATE_BAD_REFERENCE', 'The referenced enrollment/user/course does not exist.', { dbCode: code })
  }
  return new ApiError(500, 'CERTIFICATE_OPERATION_FAILED', 'The certificate operation could not be completed.', {
    dbCode: code,
    dbMessage: error?.message,
  })
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export async function findCertificateByEnrollmentId(enrollmentId) {
  const { data, error } = await supabaseAdmin
    .from('certificates')
    .select(CERTIFICATES_BASE)
    .eq('enrollment_id', enrollmentId)
    .maybeSingle()
  if (error) throw asCertificateError('lookup', error)
  return mapCertificateRow(data)
}

export async function findCertificateByNumber(certificateNumber) {
  const { data, error } = await supabaseAdmin
    .from('certificates')
    .select(CERTIFICATES_BASE)
    .eq('certificate_number', certificateNumber)
    .maybeSingle()
  if (error) throw asCertificateError('lookup', error)
  return mapCertificateRow(data)
}

export async function listCertificatesForUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('certificates')
    .select(CERTIFICATES_LIST_SELECT)
    .eq('user_id', userId)
    .order('issued_on', { ascending: false })
  if (error) throw asCertificateError('list', error)
  return (data || []).map(mapCertificateListItem)
}

export async function listCertificatesForCourses(courseIds) {
  if (!courseIds || !courseIds.length) return []
  const { data, error } = await supabaseAdmin
    .from('certificates')
    .select(CERTIFICATES_LIST_SELECT)
    .in('course_id', courseIds)
    .order('issued_on', { ascending: false })
  if (error) throw asCertificateError('list', error)
  return (data || []).map(mapCertificateListItem)
}

// The course ids owned by a trainer — the ONLY way a trainer may scope
// certificate reads (trainer_id derives from the course rows, never the client).
export async function courseIdsForTrainer(trainerId) {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('trainer_id', trainerId)
  if (error) throw asCertificateError('courses', error)
  return (data || []).map((r) => r.id)
}

export async function listCertificatesAdmin({ limit = 200, offset = 0 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('certificates')
    .select(CERTIFICATES_LIST_SELECT, { count: 'exact' })
    .order('issued_on', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw asCertificateError('list', error)
  return { certificates: (data || []).map(mapCertificateListItem), total: count ?? 0 }
}

// The highest existing certificate_number for the given year prefix
// (e.g. 'CC-2026-%'), or null when none exists yet. Used by the service to
// derive the next sequence value WITHOUT COUNT(*) — the migration mandates a
// non-count concurrency-safe numbering mechanism.
export async function latestCertificateNumberForYear(year) {
  const { data, error } = await supabaseAdmin
    .from('certificates')
    .select('certificate_number')
    .like('certificate_number', `CC-${year}-%`)
    .order('certificate_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw asCertificateError('latest', error)
  return data?.certificate_number ?? null
}

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------

export async function insertCertificateRow(input) {
  const { data, error } = await supabaseAdmin
    .from('certificates')
    .insert({
      enrollment_id: input.enrollmentId,
      user_id: input.userId,
      course_id: input.courseId,
      certificate_number: input.certificateNumber,
      legacy_certificate_id: input.legacyCertificateId ?? null,
      issued_on: input.issuedOn,
      issued_by: input.issuedBy ?? null,
    })
    .select(CERTIFICATES_BASE)
    .single()
  if (error) throw asCertificateError('create', error)
  return mapCertificateRow(data)
}