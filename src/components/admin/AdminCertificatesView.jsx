import {
  Award,
  CheckCircle2,
  Download,
  ShieldCheck,
} from 'lucide-react'
import { Card, Badge, EmptyState } from '../common/ui'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { exportCertificatePDF } from '../../utils/pdfExport'

// Governance view of every completed certificate across all courses. Only ADMIN
// reaches this route (ProtectedRoute + AllCertificates is admin-scoped in
// CourseContext, which reads the backend certificate/enrollment data).
export default function AdminCertificatesView() {
  const { currentUser } = useAuth()
  const { allCertificates, courseById } = useCourses()

  const enrich = (c) => {
    const course = c.courseId ? courseById(c.courseId) : null
    return {
      ...c,
      courseTitle: c.courseTitle || course?.title || c.courseId || '—',
      trainerName: course?.trainer || c.trainerId || '—',
    }
  }

  const rows = allCertificates
    .slice()
    .sort((a, b) => String(b.certificate?.issuedOn || '').localeCompare(String(a.certificate?.issuedOn || '')))
    .map(enrich)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary-deep">Completed Certificates</h2>
          <p className="text-sm text-slate-muted">All verified course completion certificates across every trainer and trainee.</p>
        </div>
        <Badge tone="green">{rows.length} issued</Badge>
      </div>

      <Card className="overflow-hidden">
        {rows.length ? (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-y border-border-subtle bg-sky-soft text-xs uppercase tracking-wide text-slate-muted">
                  <th className="px-6 py-3 font-medium">Trainee</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Trainer</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Certificate ID</th>
                  <th className="px-4 py-3 text-right font-medium">View / Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((c) => (
                  <tr key={`${c.courseId}:${c.traineeId}`} className="hover:bg-sky-soft/50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-light text-sm font-semibold text-primary">
                          {(c.traineeName || c.traineeId || '—').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="font-semibold text-primary-deep">{c.traineeName || c.traineeId}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-body">{c.courseTitle}</td>
                    <td className="px-4 py-3 text-slate-body">{c.trainerName}</td>
                    <td className="px-4 py-3">
                      <Badge tone="green"><CheckCircle2 size={13} /> {c.assessment?.percentage ?? '—'}%</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-body">{c.certificate?.issuedOn}</td>
                    <td className="px-4 py-3 text-slate-muted">{c.certificate?.id}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          exportCertificatePDF({
                            traineeName: c.traineeName || c.traineeId || 'Trainee',
                            courseName: c.courseTitle || 'Course',
                            completionDate: c.certificate?.issuedOn,
                            certId: c.certificate?.id,
                            trainer: c.trainerName || 'IMD Training Directorate',
                            score: c.assessment?.percentage || 82,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light"
                      >
                        <Download size={14} /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10">
            <EmptyState
              icon={ShieldCheck}
              title="No completed certificates yet"
              description="Certificates issued when trainees complete courses will appear here."
            />
          </div>
        )}
      </Card>

      {/* Authorized access reminder */}
      <Card className="p-4">
        <p className="flex items-center gap-2 text-xs text-slate-muted">
          <Award size={15} className="text-primary" />
          Access is restricted to {currentUser?.name ? `${currentUser.name} (ADMIN)` : 'ADMIN'}. Trainers only see certificates for courses they own; trainees only see their own.
        </p>
      </Card>
    </div>
  )
}