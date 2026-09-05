import { useState } from 'react'
import { ArrowRight, BookOpen, CheckCheck, Eye, FileText } from 'lucide-react'
import { Button, Card, Badge } from '../../common/ui'
import InAppFileViewer from '../../profile/InAppFileViewer'

// Study Notes section: lists the trainer-uploaded note files for the course.
// This section is always accessible; it shows a friendly empty state when the
// trainer has not uploaded any study notes yet.
export default function NotesSection({ course, done, onComplete }) {
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
        {done && <Badge tone="green"><CheckCheck size={13} /> Notes reviewed</Badge>}
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

      {course.notes && course.notes.length > 0 && !done && onComplete && (
        <div className="mt-5 flex justify-end border-t border-border-subtle pt-4">
          <Button onClick={onComplete}>
            Mark Notes as Reviewed <ArrowRight size={16} />
          </Button>
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
