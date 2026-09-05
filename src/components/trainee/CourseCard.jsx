import { ArrowRight, BarChart3, Clock, User } from 'lucide-react'
import { Badge, Button } from '../common/ui'

export default function CourseCard({ course, enrollment, onDetails }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border-soft bg-white p-5 transition-shadow hover:shadow-[0_6px_20px_rgba(31,95,147,0.08)]">
      <div className="flex items-center justify-between">
        <Badge>{course.domain}</Badge>
        {enrollment ? (
          <Badge tone="green">Enrolled · {Math.round(enrollment.progress)}%</Badge>
        ) : (
          <Badge
            tone={course.status === 'featured' ? 'navy' : 'slate'}
          >
            {course.status === 'featured' ? 'Featured' : course.difficulty}
          </Badge>
        )}
      </div>

      <h4 className="mt-3 text-base font-semibold text-primary-deep">{course.title}</h4>
      <p className="mt-1.5 line-clamp-2 text-sm text-slate-body">{course.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
        <span className="inline-flex items-center gap-1"><Clock size={13} /> {course.duration}</span>
        <span className="inline-flex items-center gap-1"><User size={13} /> {course.trainer}</span>
        <span className="inline-flex items-center gap-1"><BarChart3 size={13} /> {course.enrolled} enrolled</span>
      </div>

      {/* Syllabus preview */}
      <div className="mt-3 rounded-xl border border-border-subtle bg-sky-soft p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Syllabus</p>
        <ul className="mt-1.5 space-y-1">
          {course.syllabus.slice(0, 3).map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-xs text-slate-body">
              <span className="h-1 w-1 rounded-full bg-secondary" /> {s}
            </li>
          ))}
          {course.syllabus.length > 3 && (
            <li className="text-xs text-slate-muted">+ {course.syllabus.length - 3} more topics</li>
          )}
        </ul>
      </div>

      <div className="mt-auto pt-4">
        <Button onClick={onDetails} className="w-full" variant={enrollment ? 'outline' : 'primary'}>
          {enrollment ? 'Open Course' : 'View Details & Enroll'} <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}
