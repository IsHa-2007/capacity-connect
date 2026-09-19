// MODULE 17 — ANALYTICS SERVICE (admin insights + regional capacity)
//
// Only real aggregates are ever returned. The summary is derived from the
// canonical `course_stats` VIEW (weighted by enrollment counts) and genuine
// user/enrollment/certificate row counts; the regional model derives competency
// from completed-enrollment assessment results joined to the trainee's station
// and course domain. Every average is either computed from real rows or null —
// nothing here invents a number, a gap or a score.
//
// The pure aggregation helpers are exported so m17verify.mjs can lock their
// correctness without a database.

import { ApiError } from '../utils/apiResponse.js'
import * as repo from '../repositories/analytics.repository.js'

export const GAP_THRESHOLD = 70 // matches the frontend High-Priority rule (<70)

export function round2(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// Weighted average over [{ weight, value }] (value non-null). null when empty.
export function weightedAverage(entries) {
  const valid = (entries || []).filter((e) => e && e.value !== null && e.value !== undefined && Number(e.weight) > 0)
  if (!valid.length) return null
  const totalWeight = valid.reduce((s, e) => s + Number(e.weight), 0)
  if (!totalWeight) return null
  return round2(valid.reduce((s, e) => s + Number(e.value) * Number(e.weight), 0) / totalWeight)
}

// Aggregate completed-enrollment assessment results by station.
// rows: [{ station, domain, competency }] with competency already non-null.
// Returns Map(station -> { count, competency, domains: Map(domain -> { sum, count }) }).
export function aggregateCompetencyByStation(rows) {
  const map = new Map()
  for (const r of rows || []) {
    if (!r || r.station == null || r.competency == null) continue
    let entry = map.get(r.station)
    if (!entry) {
      entry = { count: 0, domains: new Map() }
      map.set(r.station, entry)
    }
    let dom = entry.domains.get(r.domain || 'General')
    if (!dom) {
      dom = { sum: 0, count: 0 }
      entry.domains.set(r.domain || 'General', dom)
    }
    dom.sum += Number(r.competency)
    dom.count += 1
    entry.count += 1
  }
  for (const entry of map.values()) {
    entry.competency = null
    const stations = Array.from(entry.domains.values())
    if (stations.length) entry.competency = round2(stations.reduce((s, d) => s + d.sum, 0) / stations.reduce((s, d) => s + d.count, 0))
  }
  return map
}

// Build the region/station model. stationMap: [{ station, region }];
// byStation: Map(station -> aggregated entry); userCounts: Map(station -> count).
// Regions are emitted in the verified seed order (North, West, East, South).
export function buildRegionalRows(stationMap, byStation, userCounts) {
  const REGION_ORDER = ['North', 'West', 'East', 'South']
  const groups = new Map()
  for (const { station, region } of stationMap || []) {
    if (!groups.has(region)) groups.set(region, [])
    groups.get(region).push(station)
  }
  const regions = []
  for (const region of REGION_ORDER) {
    const stations = groups.get(region) || []
    const stationRows = stations
      .map((station) => {
        const entry = byStation.get(station)
        const domainBreakdown = entry
          ? Array.from(entry.domains.entries()).map(([domain, d]) => ({
              domain,
              competency: round2(d.sum / d.count),
              sampleSize: d.count,
            }))
          : []
        return {
          station,
          region,
          userCount: (userCounts && userCounts.get(station)) || 0,
          competency: entry ? entry.competency : null,
          sampleSize: entry ? entry.count : 0,
          domainBreakdown,
        }
      })
      .sort((a, b) => a.station.localeCompare(b.station))
    const withData = stationRows.filter((s) => s.competency !== null)
    const competency = withData.length
      ? round2(withData.reduce((s, r) => s + r.competency, 0) / withData.length)
      : null
    // Real skill-gap candidates: domains with real results below the threshold.
    const domainPool = new Map()
    for (const s of withData) {
      for (const d of s.domainBreakdown) {
        const existing = domainPool.get(d.domain) || { sum: 0, count: 0 }
        existing.sum += d.competency
        existing.count += 1
        domainPool.set(d.domain, existing)
      }
    }
    const domainGaps = Array.from(domainPool.entries())
      .map(([domain, agg]) => ({ domain, competency: round2(agg.sum / agg.count), sampleSize: agg.count }))
      .filter((d) => d.competency !== null && d.competency < GAP_THRESHOLD)
      .sort((a, b) => a.competency - b.competency)
    regions.push({
      region,
      stationCount: stationRows.length,
      userCount: stationRows.reduce((s, r) => s + r.userCount, 0),
      competency,
      domainGaps,
      stations: stationRows,
    })
  }
  return regions
}

// ---------------------------------------------------------------------------
// Admin-only operations
// ---------------------------------------------------------------------------

export async function getInsights({ actor }) {
  if (!actor || actor.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only an ADMIN can view capacity insights.')
  }
  const [courseStats, courseStatusCounts, stationMap] = await Promise.all([
    repo.fetchCourseStats(),
    repo.fetchCoursesCountByStatus(),
    repo.fetchStationRegionMap(),
  ])

  const courses = (courseStats || []).map((row) => ({
    courseId: row.course_id,
    title: row.title || null,
    domain: row.domain || null,
    difficulty: row.difficulty || null,
    enrollmentCount: row.enrollment_count || 0,
    completedCount: row.completed_count || 0,
    avgAssessmentPercentage: row.avg_assessment_percentage,
    passedAssessmentCount: row.passed_assessment_count || 0,
    avgFeedbackContentDepth: row.avg_feedback_content_depth,
    avgFeedbackTrainerDelivery: row.avg_feedback_trainer_delivery,
    avgFeedbackOperationalRelevance: row.avg_feedback_operational_relevance,
    questionCount: row.question_count || 0,
    validQuestionCount: row.valid_question_count || 0,
    notesCount: row.notes_count || 0,
    slidesCount: row.slides_count || 0,
    videosCount: row.videos_count || 0,
    practiceCount: row.practice_count || 0,
  })).filter((c) => c.courseId)

  const enrollWeights = courses.map((c) => ({ weight: c.enrollmentCount, value: c.avgAssessmentPercentage }))
  const totalEnrollments = courses.reduce((s, c) => s + c.enrollmentCount, 0)
  const totalCompleted = courses.reduce((s, c) => s + c.completedCount, 0)

  const [totalUsers, approvedTrainers, approvedTrainees, pendingApprovals, certificatesIssued] = await Promise.all([
    repo.fetchCount({ table: 'users' }),
    repo.fetchCount({ table: 'users', conditions: [['role', 'TRAINER'], ['approval_status', 'APPROVED']] }),
    repo.fetchCount({ table: 'users', conditions: [['role', 'TRAINEE'], ['approval_status', 'APPROVED']] }),
    repo.fetchCount({ table: 'users', conditions: [['approval_status', 'PENDING']] }),
    repo.fetchCount({ table: 'certificates' }),
  ])

  const summary = {
    totalUsers,
    approvedTrainers,
    approvedTrainees,
    pendingApprovals,
    certificatesIssued,
    totalCourses: courses.length,
    publishedCourses: courseStatusCounts.PUBLISHED || 0,
    totalEnrollments,
    completedEnrollments: totalCompleted,
    completionRate: totalEnrollments ? round2((totalCompleted / totalEnrollments) * 100) : null,
    avgAssessmentPercentage: weightedAverage(enrollWeights),
    passedAssessments: courses.reduce((s, c) => s + c.passedAssessmentCount, 0),
    avgFeedbackContentDepth: weightedAverage(courses.map((c) => ({ weight: c.enrollmentCount, value: c.avgFeedbackContentDepth }))),
    avgFeedbackTrainerDelivery: weightedAverage(courses.map((c) => ({ weight: c.enrollmentCount, value: c.avgFeedbackTrainerDelivery }))),
    avgFeedbackOperationalRelevance: weightedAverage(courses.map((c) => ({ weight: c.enrollmentCount, value: c.avgFeedbackOperationalRelevance }))),
    questionCount: courses.reduce((s, c) => s + c.questionCount, 0),
    validQuestionCount: courses.reduce((s, c) => s + c.validQuestionCount, 0),
    stationCount: stationMap.length,
    regionCount: new Set(stationMap.map((s) => s.region)).size,
  }

  return { summary, courses }
}

export async function getRegional({ actor }) {
  if (!actor || actor.role !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only an ADMIN can view regional capacity.')
  }
  const [stationMap, userStations, sourceRows] = await Promise.all([
    repo.fetchStationRegionMap(),
    repo.fetchApprovedUserStations(),
    repo.fetchCompetencySourceRows(),
  ])

  const competencyRows = (sourceRows || [])
    .filter((r) => r.assessment_percentage != null && r.users?.station)
    .map((r) => ({ station: r.users.station, domain: r.courses?.domain || 'General', competency: Number(r.assessment_percentage) }))

  const byStation = aggregateCompetencyByStation(competencyRows)

  const userCounts = new Map()
  for (const { station } of userStations || []) {
    if (station) userCounts.set(station, (userCounts.get(station) || 0) + 1)
  }

  const regions = buildRegionalRows(stationMap, byStation, userCounts)
  const stations = regions.flatMap((r) => r.stations.map((s) => ({ ...s, region: r.region })))

  return { regions, stations, generatedAt: new Date().toISOString() }
}