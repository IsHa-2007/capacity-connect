import { useState } from 'react'
import { BookOpen, CheckCheck, Eye, FileText } from 'lucide-react'
import { Card, Badge } from '../../common/ui'
import InAppFileViewer from '../../profile/InAppFileViewer'

// Study Notes section: lists the trainer-uploaded note files for the course.
// Opening the section auto-marks the corresponding material step as read via the
// backend progress API (idempotent). A ✓ Read badge shows only after the backend
// confirms; while the confirmation is in flight a subtle "Marking as read…"
// indicator appears.
export default function NotesSection({ course, done, completing }) {
  const [viewing, setViewing] = useState(null)

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <BookOpen size={18} className="text-primary" /> Study Notes
          </h3>
          <p className="text-sm text-slate-muted">Reference material prepared by the trainer for {course.title}.</p>
        </div>
        {done ? (
          <Badge tone="green"><CheckCheck size={13} /> Read</Badge>
        ) : completing ? (
          <Badge tone="blue">Marking as read…</Badge>
        ) : null}
      </div>

      {course.notes && course.notes.length ? (
        <div className="mt-5 space-y-2">
          {course.notes.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-border-soft bg-sky-soft px-4 py-3">
              <button onClick={() => setViewing(m)} className="flex items-center gap-3 text-left">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-primary"><FileText size={16} /></span>
                <span>
                  <span className="block text-sm font-medium text-primary-deep">{m.title || m.name}</span>
                  <span className="block text-xs text-slate-muted">
                    {(m.fileType || m.type || 'file').toUpperCase()}
                    {m.size ? ` · ${(m.size / 1024).toFixed(0)} KB` : ''}
                  </span>
                </span>
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light" onClick={() => setViewing(m)}>
                <Eye size={14} /> View
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border-soft bg-sky-soft p-6 text-center">
          <p className="text-sm text-slate-muted">No study notes available yet.</p>
          <p className="mt-1 text-xs text-slate-muted">The trainer has not uploaded study notes for this course. Check back later.</p>
        </div>
      )}

      <InAppFileViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        fileURL={viewing?.fileURL}
        fileType={viewing?.fileType}
        title={viewing?.title || viewing?.name}
        fileName={viewing?.name}
      />
    </Card>
  )
}
