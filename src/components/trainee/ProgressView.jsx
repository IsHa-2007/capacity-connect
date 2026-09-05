import { useMemo } from 'react'
import {
  Award,
  BarChart3,
  BookOpen,
  GaugeCircle,
  Star,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useCourses } from '../../context/CourseContext'
import { Card, Badge, ProgressBar, StatCard, EmptyState } from '../common/ui'

export default function ProgressView() {
  const { courseCatalog, getEnrollment } = useCourses()
  const enrollments = courseCatalog
    .filter((c) => getEnrollment(c.id))
    .map((c) => ({ course: c, enrollment: getEnrollment(c.id) }))

  const avgCompletion = enrollments.length
    ? enrollments.reduce((s, e) => s + (e.enrollment.progress || 0), 0) / enrollments.length
    : 0
  const completed = enrollments.filter((e) => e.enrollment.status === 'completed').length
  const inProgress = enrollments.length - completed
  const scores = enrollments.filter((e) => e.enrollment.assessment)
  const avgScore = scores.length
    ? scores.reduce((s, e) => s + (e.enrollment.assessment.percentage || 0), 0) / scores.length
    : 0

  const skillAreas = useMemo(
    () =>
      enrollments.map(({ course, enrollment }) => ({
        domain: course.domain,
        title: course.title,
        progress: enrollment.progress,
        competency: competencyLevel(enrollment.progress),
      })),
    [enrollments],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary-deep">Progress & Analytics</h2>
        <p className="text-sm text-slate-muted">Track your learning completion, assessments, and competency development.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="Overall Completion" value={`${Math.round(avgCompletion)}%`} sub={`${inProgress} in progress`} />
        <StatCard icon={Award} label="Courses Completed" value={completed} sub={`${enrollments.length} total enrolled`} tone="green" />
        <StatCard icon={BarChart3} label="Avg Assessment" value={avgScore ? `${Math.round(avgScore)}%` : '—'} sub={`${scores.length} assessments`} tone="amber" />
        <StatCard icon={Target} label="Competency Level" value={competencyLevel(avgCompletion)} sub="Overall readiness" tone="navy" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Skill development */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <TrendingUp size={18} className="text-primary" /> Skill Development
          </h3>
          {skillAreas.length ? (
            <div className="mt-4 space-y-4">
              {skillAreas.map((s) => (
                <div key={s.title}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-primary-deep">{s.title}</p>
                      <p className="text-xs text-slate-muted">{s.domain}</p>
                    </div>
                    <Badge tone={s.competency === 'Proficient' ? 'green' : s.competency === 'Developing' ? 'amber' : 'slate'}>{s.competency}</Badge>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={s.progress} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Target} title="No skill data yet" description="Enroll in courses to start building your competency record." />
          )}
        </Card>

        {/* Competency levels */}
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <GaugeCircle size={18} className="text-primary" /> Competency Distribution
          </h3>
          <div className="mt-4 space-y-3">
            {(['Proficient', 'Developing', 'Foundational']).map((lvl) => {
              const count = skillAreas.filter((s) => s.competency === lvl).length
              const pct = skillAreas.length ? (count / skillAreas.length) * 100 : 0
              return (
                <div key={lvl} className="rounded-xl border border-border-subtle bg-sky-soft p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-primary-deep">{lvl}</span>
                    <span className="text-sm font-semibold text-slate-body">{count}</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar value={pct} color="bg-primary" /></div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="flex items-center gap-1.5 font-medium"><Star size={13} /> Recommended</p>
            <p className="mt-1">Focus on completing Weather Forecasting Fundamentals to reach Proficient level.</p>
          </div>
        </Card>
      </div>

      {/* Enforcement: course-wise cards */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-muted">Course Performance</h3>
        {enrollments.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {enrollments.map(({ course, enrollment }) => (
              <Card key={course.id} className="p-5">
                <div className="flex items-center justify-between">
                  <Badge>{course.domain}</Badge>
                  {enrollment.status === 'completed' ? <Badge tone="green">Completed</Badge> : <Badge>In Progress</Badge>}
                </div>
                <h4 className="mt-2 font-semibold text-primary-deep">{course.title}</h4>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-muted">Completion</span>
                  <span className="font-medium text-primary">{Math.round(enrollment.progress)}%</span>
                </div>
                <div className="mt-1"><ProgressBar value={enrollment.progress} /></div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border-subtle bg-sky-soft p-3 text-center">
                    <p className="text-xs text-slate-muted">Assessment</p>
                    <p className="font-semibold text-primary-deep">{enrollment.assessment ? `${enrollment.assessment.percentage}%` : '—'}</p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-sky-soft p-3 text-center">
                    <p className="text-xs text-slate-muted">Attempts</p>
                    <p className="font-semibold text-primary-deep">{enrollment.assessment ? 1 : 0}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card><EmptyState icon={GaugeCircle} title="No performance data" description="Enroll and complete courses to see analytics here." /></Card>
        )}
      </div>
    </div>
  )
}

function competencyLevel(progress) {
  if (progress >= 75) return 'Proficient'
  if (progress >= 40) return 'Developing'
  return 'Foundational'
}
