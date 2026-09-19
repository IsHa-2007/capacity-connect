// MODULE 17 — ANALYTICS REPOSITORY (admin insights + regional capacity)
//
// Reads the FROZEN Module 5 schema only. Aggregates come from the dedicated
// `course_stats` VIEW (the schema's canonical per-course statistics source) and
// from real user/enrollment/certificate rows. NOTHING here synthesises numbers:
// any value the UI shows is computed from persisted rows, or reported as null
// when there is genuinely no data.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

function asAnalyticsError(operation, error) {
  return new ApiError(500, `ANALYTICS_${operation.toUpperCase()}_UNEXPECTED`, 'The analytics could not be computed. Please try again.', {
    dbCode: error?.code,
    dbMessage: error?.message,
  })
}

// The course_stats VIEW (one row per course): enrollment/completion counts,
// weighted assessment average, passed-assessment count, feedback averages, and
// per-course question/section content counts.
export async function fetchCourseStats() {
  const { data, error } = await supabaseAdmin.from('course_stats').select('*')
  if (error) throw asAnalyticsError('course_stats', error)
  return data || []
}

export async function fetchCount({ table, conditions = [] } = {}) {
  let builder = supabaseAdmin.from(table).select('id', { count: 'exact', head: true })
  for (const [key, value] of conditions) builder = builder.eq(key, value)
  const { count, error } = await builder
  if (error) throw asAnalyticsError('count', error)
  return count || 0
}

export async function fetchCoursesCountByStatus() {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('status')
  if (error) throw asAnalyticsError('courses', error)
  const counts = { DRAFT: 0, PUBLISHED: 0 }
  for (const r of data || []) {
    if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] += 1
  }
  return counts
}

// station_region_map rows: the verified 12 stations and their region.
export async function fetchStationRegionMap() {
  const { data, error } = await supabaseAdmin.from('station_region_map').select('station, region')
  if (error) throw asAnalyticsError('stations', error)
  return data || []
}

// Approved users by station — the active workforce count per station.
export async function fetchApprovedUserStations() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('station')
    .eq('approval_status', 'APPROVED')
  if (error) throw asAnalyticsError('users', error)
  return data || []
}

// Completed-enrollment assessment results joined to the trainee's station and
// the course's domain — the real source of regional competency. Rows where no
// assessment result exists are excluded so no average ever includes a guess.
export async function fetchCompetencySourceRows() {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('user_id, course_id, assessment_percentage, users(station), courses(domain)')
    .eq('status', 'COMPLETED')
    .not('assessment_percentage', 'is', null)
  if (error) throw asAnalyticsError('competency', error)
  return data || []
}