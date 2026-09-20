import { useState } from 'react'
import { CheckCheck, ExternalLink, Eye, PlayCircle } from 'lucide-react'
import { Card, Badge } from '../../common/ui'
import InAppFileViewer from '../../profile/InAppFileViewer'

// Video Lectures section: lists trainer-provided video links OR uploaded video
// files. Opening the section auto-marks the corresponding material step as
// viewed via the backend progress API (idempotent) — it does NOT claim the
// entire video was watched, hence the honest "Viewed"/"Completed" wording.
export default function VideoSection({ course, done, completing }) {
  const videos = course.videos || []
  const [viewing, setViewing] = useState(null)
  const [watched, setWatched] = useState(() => new Set(done ? videos.map((_, i) => i) : []))

  const toggleWatched = (i) => {
    setWatched((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const isUploaded = (v) => Boolean(v.fileURL)

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
            <PlayCircle size={18} className="text-primary" /> Video Lectures
          </h3>
          <p className="text-sm text-slate-muted">Recorded lectures and links selected by the trainer.</p>
        </div>
        <div className="flex items-center gap-2">
          {videos.length ? <Badge>{videos.length} video{videos.length === 1 ? '' : 's'}</Badge> : null}
          {done ? (
            <Badge tone="green"><CheckCheck size={13} /> Viewed</Badge>
          ) : completing ? (
            <Badge tone="blue">Marking as viewed…</Badge>
          ) : null}
        </div>
      </div>

      {videos.length ? (
        <div className="mt-5 space-y-2">
          {videos.map((v, i) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-sky-soft px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-primary"><PlayCircle size={16} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary-deep">{v.title}</p>
                  <p className="truncate text-xs text-slate-muted">
                    {isUploaded(v) ? String(v.fileType || 'video').toUpperCase() : v.url}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleWatched(i)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    watched.has(i)
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-primary/30 bg-white text-primary hover:bg-sky-light'
                  }`}
                >
                  <CheckCheck size={14} /> {watched.has(i) ? 'Watched' : 'Mark Watched'}
                </button>
                {isUploaded(v) ? (
                  <button
                    onClick={() => setViewing(v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light"
                  >
                    <Eye size={14} /> Watch
                  </button>
                ) : (
                  v.url && (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light"
                    >
                      <ExternalLink size={14} /> Open
                    </a>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border-soft bg-sky-soft p-6 text-center">
          <p className="text-sm text-slate-muted">No video lectures available yet.</p>
          <p className="mt-1 text-xs text-slate-muted">The trainer has not uploaded any video lectures for this course. Check back later.</p>
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