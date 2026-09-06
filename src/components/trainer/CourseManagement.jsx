import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  CheckSquare,
  ChevronLeft,
  Download,
  Eye,
  FileText,
  FileUp,
  FolderOpen,
  Loader2,
  PlayCircle,
  Plus,
  Presentation,
  Save,
  Trash2,
  Users,
  Award,
  Edit3,
  Upload,
  AlertTriangle,
} from 'lucide-react'
import { Card, Button, Badge, Tabs, Modal, EmptyState } from '../common/ui'
import InAppFileViewer from '../profile/InAppFileViewer'
import { useCourses } from '../../context/CourseContext'
import { forFolderError, isValidQuestion, MIN_VALID_QUESTIONS } from '../../services/courseService'
import { exportCertificatePDF } from '../../utils/pdfExport'

// Module 3 course workspace. The five content/publishing stages map to:
// Study Notes, Slide Decks, Video Lectures, Practice, then Assessment (Question
// Bank). Draft courses are owner-only; published courses join the shared catalog.
const SECTIONS = ['Details', 'Study Notes', 'Slide Decks', 'Video Lectures', 'Practice', 'Trainees', 'Question Bank', 'Analytics']

export default function CourseManagement({ courseId }) {
  const { courseById, updateCourse, publishCourse, togglePublish } = useCourses()
  const [params] = useSearchParams()
  const course = courseId ? courseById(courseId) : null
  const initialTab = params.get('tab') || 'Details'
  const [tab, setTab] = useState(() => (SECTIONS.includes(initialTab) ? initialTab : 'Details'))
  const [editCourse, setEditCourse] = useState(false)
  const [publishDialog, setPublishDialog] = useState(null)
  const navigate = useNavigate()

  if (!course) return null

  const onPublish = () => {
    const result = publishCourse(course.id)
    if (result?.ok) {
      setPublishDialog({ ok: true, errors: [], warnings: result.warnings || [] })
    } else {
      setPublishDialog({ ok: false, errors: result?.errors || [], warnings: result?.warnings || [] })
    }
  }

  const onUnpublish = () => togglePublish(course.id)

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/trainer/courses')} className="inline-flex items-center gap-1 text-sm text-slate-muted hover:text-primary">
        <ChevronLeft size={16} /> Back to My Courses
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge>{course.domain}</Badge>
            <Badge tone={course.status === 'published' || course.status === 'featured' ? 'green' : 'slate'}>
              {course.status === 'published' || course.status === 'featured' ? 'Published' : 'Draft'}
            </Badge>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-primary-deep">{course.title}</h2>
          <p className="mt-1 text-sm text-slate-body">{course.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge>{course.enrolled} enrolled</Badge>
          {course.status === 'published' || course.status === 'featured' ? (
            <Button variant="subtle" size="sm" onClick={onUnpublish}>
              <Eye size={15} /> Unpublish from Catalog
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onPublish}>
              <Eye size={15} /> Publish to Catalog
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={SECTIONS} active={tab} onChange={setTab} />

      <div>
        {tab === 'Details' && <DetailsSection course={course} openEdit={() => setEditCourse(true)} onPublish={onPublish} onUnpublish={onUnpublish} />}
        {tab === 'Study Notes' && <SectionManager course={course} section="notes" icon={FolderOpen} title="Study Notes" empty="No study notes yet. Upload PDF notes / documents." />}
        {tab === 'Slide Decks' && <SectionManager course={course} section="slides" icon={Presentation} title="Slide Decks" empty="No slide decks yet. Upload PPT / PDF decks." />}
        {tab === 'Video Lectures' && <VideoManager course={course} />}
        {tab === 'Practice' && <SectionManager course={course} section="practice" icon={FileText} title="Practice Material" empty="No practice material yet. Upload practice sets / problems." />}
        {tab === 'Trainees' && <TraineesTable course={course} />}
        {tab === 'Question Bank' && <QuestionBank course={course} />}
        {tab === 'Analytics' && <TrainerAnalytics course={course} />}
      </div>

      <EditCourseModal
        course={course}
        open={editCourse}
        onClose={() => setEditCourse(false)}
        onSave={(patch) => updateCourse(course.id, patch)}
      />

      <PublishResultModal dialog={publishDialog} onClose={() => setPublishDialog(null)} course={course} />
    </div>
  )
}

function PublishResultModal({ dialog, onClose, course }) {
  if (!dialog) return null
  return (
    <Modal open onClose={onClose} title={dialog.ok ? 'Course Published' : 'Cannot Publish Yet'} size="max-w-md">
      <div className="space-y-3">
        {dialog.ok ? (
          <p className="text-sm text-slate-body">
            <span className="font-medium text-emerald-600">{course.title}</span> is now live in the trainee course catalog.
            {course.status !== 'published' && ' Draft courses are only visible to you.'}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <ul className="list-inside list-disc text-sm">
                {dialog.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
            <p className="text-xs text-slate-muted">Complete the required fields (title, description, domain) and add at least one valid question to the Question Bank, then publish again.</p>
          </div>
        )}
        {dialog.warnings?.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-sky-200 bg-sky-soft p-3 text-xs text-slate-body">
            <p className="font-medium text-primary">Question bank readiness</p>
            {dialog.warnings.map((w) => <p key={w}>{w}</p>)}
            {!dialog.ok && <p className="text-slate-muted">This is a warning only — it does not block publishing above.</p>}
          </div>
        )}
        <div className="flex justify-end pt-1">
          <Button variant="subtle" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}

function DetailsSection({ course, openEdit, onPublish, onUnpublish }) {
  const isPublished = course.status === 'published' || course.status === 'featured'
  return (
    <Card className="p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-primary-deep">Course Information</h4>
          <dl className="mt-3 space-y-2 text-sm">
            <DetailRow label="Scientific Domain" value={course.domain} />
            <DetailRow label="Sub-domain" value={course.subdomain || '—'} />
            <DetailRow label="Audience" value={course.audience || '—'} />
            <DetailRow label="Difficulty" value={course.difficulty} />
            <DetailRow label="Estimated Duration" value={course.duration} />
            <DetailRow label="Status" value={isPublished ? 'Published' : 'Draft'} />
            <DetailRow label="Trainer" value={course.trainer} />
            <DetailRow label="Created" value={course.createdAt ? new Date(course.createdAt).toLocaleDateString() : '—'} />
            {course.publishedAt && <DetailRow label="Published" value={new Date(course.publishedAt).toLocaleDateString()} />}
            <DetailRow label="Tags" value={(course.tags || []).join(', ') || '—'} />
          </dl>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-primary-deep">Learning Objectives</h4>
          <ul className="mt-3 space-y-1.5">
            {(course.objectives || []).map((o) => (
              <li key={o} className="flex items-start gap-2 text-sm text-slate-body">
                <CheckSquare size={15} className="mt-0.5 shrink-0 text-primary" /> {o}
              </li>
            ))}
          </ul>
          <h4 className="mt-5 text-sm font-semibold text-primary-deep">Syllabus</h4>
          <ol className="mt-2 space-y-1.5">
            {(course.syllabus || []).map((s, i) => (
              <li key={s} className="flex items-start gap-2 text-sm text-slate-body">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-light text-[11px] font-semibold text-primary">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          {!!(course.prerequisites?.length) && (
            <>
              <h4 className="mt-5 text-sm font-semibold text-primary-deep">Prerequisites</h4>
              <ul className="mt-2 space-y-1">
                {(course.prerequisites || []).map((p) => (
                  <li key={p} className="list-inside list-disc text-sm text-slate-body">{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" size="sm" onClick={openEdit}><Edit3 size={15} /> Edit Course</Button>
        {isPublished ? (
          <Button variant="subtle" size="sm" onClick={onUnpublish}><Eye size={15} /> Set to Draft</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onPublish}><Eye size={15} /> Publish to Catalog</Button>
        )}
      </div>
    </Card>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-border-subtle pb-2">
      <dt className="text-slate-muted">{label}</dt>
      <dd className="font-medium text-primary-deep">{value}</dd>
    </div>
  )
}

function EditCourseModal({ course, open, onClose, onSave }) {
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    domain: course.domain,
    subdomain: course.subdomain || '',
    audience: course.audience || '',
    difficulty: course.difficulty,
    duration: course.duration,
    prerequisites: (course.prerequisites || []).join('\n'),
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = () => {
    onSave({
      ...form,
      objectives: course.objectives,
      syllabus: course.syllabus,
      prerequisites: form.prerequisites.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit Course" size="max-w-xl">
      <div className="space-y-4">
        <Field label="Title"><input value={form.title} onChange={set('title')} className="inp" /></Field>
        <Field label="Description"><textarea value={form.description} onChange={set('description')} rows={3} className="inp resize-none" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Domain"><input value={form.domain} onChange={set('domain')} className="inp" /></Field>
          <Field label="Sub-domain"><input value={form.subdomain} onChange={set('subdomain')} className="inp" /></Field>
        </div>
        <Field label="Audience"><input value={form.audience} onChange={set('audience')} className="inp" placeholder="e.g. IMD forecasters, district officers" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Difficulty">
            <select value={form.difficulty} onChange={set('difficulty')} className="inp">
              {['Beginner', 'Intermediate', 'Advanced'].map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Duration">
            <select value={form.duration} onChange={set('duration')} className="inp">
              {['2 weeks', '3 weeks', '4 weeks', '5 weeks', '6 weeks'].map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Prerequisites (one per line)">
          <textarea value={form.prerequisites} onChange={set('prerequisites')} rows={2} className="inp resize-none" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}><Save size={15} /> Save Changes</Button>
        </div>
      </div>
      <style>{`.inp{width:100%;border-radius:0.5rem;border:1px solid #DCE6F0;background:#F5F8FC;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#4E84B7;background:#fff}`}</style>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Generic content-section manager (Study Notes / Slide Decks / Practice).
// Handles uploading files (Firebase Storage or dev-mock object URL) and
// opening them in-app via the shared InAppFileViewer.
// ---------------------------------------------------------------------------
function SectionManager({ course, section, icon: Icon, title, empty }) {
  const { addContent, removeContent, uploadCourseFile } = useCourses()
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const items = course[section] || []

  const handleFile = async (file) => {
    if (!file) return
    setErr('')
    const msg = forFolderError(section, file)
    if (msg) {
      setErr(msg)
      fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const ref = await uploadCourseFile(course.id, section, file)
      await addContent(course.id, section, {
        name: file.name,
        title: file.name,
        type: FileType(file.type),
        fileURL: ref.fileURL,
        fileType: ref.fileType,
        storagePath: ref.storagePath,
        size: file.size,
        addedAt: new Date().toISOString(),
      })
    } catch (e) {
      setErr(e?.message || 'Could not upload the file.')
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  const remove = (id) => removeContent(course.id, section, id)

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-semibold text-primary-deep"><Icon size={17} className="text-primary" /> {title}</h4>
        <Badge>{items.length} item{items.length === 1 ? '' : 's'}</Badge>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border-soft bg-sky-soft p-4 sm:flex-row sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept={acceptFor(section)}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="inp flex-1"
          disabled={uploading}
        />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
          {uploading ? 'Uploading…' : 'Upload File'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-muted">{allowedFor(section)}</p>
      {err && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
          <AlertTriangle size={13} /> {err}
        </p>
      )}

      {items.length ? (
        <div className="mt-4 space-y-2">
          {items.map((m) => (
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
              <div className="flex items-center gap-1">
                <button className="rounded p-1 text-slate-muted hover:text-primary" title="View in-app" onClick={() => setViewing(m)}><Eye size={16} /></button>
                <button onClick={() => remove(m.id)} className="rounded p-1 text-slate-muted hover:text-rose-600"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-muted">{empty}</p>
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

function VideoManager({ course }) {
  const { addContent, removeContent, uploadCourseFile } = useCourses()
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const videos = course.videos || []
  const handleFile = async (file) => {
    if (!file) return
    setErr('')
    const msg = forFolderError('videos', file)
    if (msg) {
      setErr(msg)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const ref = await uploadCourseFile(course.id, 'videos', file)
      await addContent(course.id, 'videos', {
        name: file.name,
        title: title.trim() || file.name,
        type: 'video',
        duration: '—',
        fileURL: ref.fileURL,
        fileType: ref.fileType,
        storagePath: ref.storagePath,
        size: file.size,
        addedAt: new Date().toISOString(),
      })
      setTitle('')
    } catch (e) {
      setErr(e?.message || 'Could not upload the video.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-semibold text-primary-deep"><PlayCircle size={17} className="text-primary" /> Video Lectures</h4>
        <Badge>{videos.length} item{videos.length === 1 ? '' : 's'}</Badge>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark"
          disabled={uploading}
        >
          <Upload size={13} /> Upload Video File
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border-soft bg-sky-soft p-4 sm:flex-row sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mp4,.webm,.ogg,.mov,.mkv"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="sr-only"
          disabled={uploading}
        />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title (optional)" className="inp flex-1" />
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
          {uploading ? 'Uploading…' : 'Upload Video'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-muted">Accepts MP4, WebM, OGG, MOV, MKV.</p>
      {err && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
          <AlertTriangle size={13} /> {err}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {videos.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-xl border border-border-soft bg-sky-soft px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-primary"><PlayCircle size={16} /></span>
              <div>
                <p className="text-sm font-medium text-primary-deep">{v.title}</p>
                <p className="text-xs text-slate-muted">
                  {v.fileType === 'link' || (!v.fileType && v.url) ? (v.url || 'Video link') : String(v.fileType || 'video').toUpperCase()}
                  {v.size ? ` · ${(v.size / 1024).toFixed(0)} KB` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {v.fileURL && (
                <button
                  onClick={() => setViewing(v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light"
                >
                  <Eye size={14} /> Watch
                </button>
              )}
              <button onClick={() => removeContent(course.id, 'videos', v.id)} className="text-slate-muted hover:text-rose-600"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {videos.length === 0 && <p className="text-sm text-slate-muted">No videos yet. These appear in the trainee Video Lectures stage.</p>}
      </div>

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

function TraineesTable({ course }) {
  const { traineesForCourse } = useCourses()
  const navigate = useNavigate()
  const rows = traineesForCourse(course.id)
  const completed = rows.filter((e) => e.status === 'completed').length
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <h4 className="flex items-center gap-2 font-semibold text-primary-deep"><Users size={17} className="text-primary" /> Enrolled Trainees</h4>
        <div className="flex items-center gap-2">
          <Badge>{rows.length} enrolled</Badge>
          <Badge tone="green">{completed} completed</Badge>
        </div>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-y border-border-subtle bg-sky-soft text-xs uppercase tracking-wide text-slate-muted">
                <th className="px-6 py-3 font-medium">Trainee</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Certificate</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((t) => (
                <tr key={`${t.courseId}:${t.traineeId || t.id || t.courseId}`} className="group cursor-pointer transition-colors hover:bg-sky-soft/50" onClick={() => navigate(`/trainer/profile/${t.traineeId}`)}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-light text-sm font-semibold text-primary">
                        {(t.traineeName || t.traineeId || '—').slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-primary-deep">{t.traineeName || t.traineeId}</div>
                        <div className="text-xs text-slate-muted">{t.courseTitle || course.title}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-[#EAF0F6]"><div className="h-1.5 rounded-full bg-secondary" style={{ width: `${t.progress}%` }} /></div>
                      <span className="text-slate-muted">{t.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-body">{t.stage}</td>
                  <td className="px-4 py-3">{t.assessment?.percentage ?? '—'}</td>
                  <td className="px-4 py-3"><Badge tone={t.status === 'completed' ? 'green' : 'blue'}>{t.status === 'completed' ? 'Completed' : 'In Progress'}</Badge></td>
                  <td className="px-4 py-3">
                    {t.certificate ? (
                      <div className="flex items-center gap-2">
                        <Badge tone="green"><Award size={13} /> Issued</Badge>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            exportCertificatePDF({
                              traineeName: t.traineeName || t.traineeId || 'Trainee',
                              courseName: course.title,
                              completionDate: t.certificate.issuedOn,
                              certId: t.certificate.id,
                              trainer: course.trainer,
                              score: t.assessment?.percentage || 82,
                            })
                          }}
                        >
                          <Download size={13} /> PDF
                        </Button>
                      </div>
                    ) : (
                      <span className="text-slate-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="subtle" onClick={(e) => { e.stopPropagation(); navigate(`/trainer/profile/${t.traineeId}`); }}>View Profile</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-6 py-8"><EmptyState icon={Users} title="No trainees enrolled yet" description="Enrolled trainees appear here once they join this course." /></div>
      )}
    </Card>
  )
}

function QuestionBank({ course }) {
  const { addQuestion, updateQuestion, deleteQuestion, courseReadiness } = useCourses()
  const [filter, setFilter] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const bank = course.bank || []
  const filtered = filter === 'All' ? bank : bank.filter((q) => q.difficulty === filter.toLowerCase())
  const counts = ['easy', 'medium', 'hard'].map((d) => ({ d, n: bank.filter((q) => q.difficulty === d).length }))
  const validCount = bank.filter(isValidQuestion).length
  const readiness = courseReadiness(course)
  const bankReady = validCount >= MIN_VALID_QUESTIONS

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-semibold text-primary-deep"><BookOpen size={17} className="text-primary" /> Question Bank Manager</h4>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="inp w-32">
            <option>All</option><option>Easy</option><option>Medium</option><option>Hard</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Question</Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {counts.map(({ d, n }) => (
          <Badge key={d} tone={d === 'easy' ? 'green' : d === 'medium' ? 'amber' : 'navy'}>{n} {d}</Badge>
        ))}
        <span className="text-xs text-slate-muted">· targets 20:30:50 assessment</span>
        {readiness.warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            <AlertTriangle size={12} /> balanced coverage recommended
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-border-subtle bg-sky-soft px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-primary-deep">{validCount} / {MIN_VALID_QUESTIONS} valid questions</p>
          {bankReady ? (
            <Badge tone="green">Ready to publish</Badge>
          ) : (
            <Badge tone="amber">Minimum {MIN_VALID_QUESTIONS} required</Badge>
          )}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#EAF0F6]">
          <div
            className={`h-2 rounded-full transition-all ${bankReady ? 'bg-emerald-500' : 'bg-amber-400'}`}
            style={{ width: `${Math.min(100, (validCount / MIN_VALID_QUESTIONS) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-muted">
          {bankReady
            ? 'Enough valid questions are present. The course can be published and its assessment generated.'
            : `Add ${MIN_VALID_QUESTIONS - validCount} more valid question(s) (text + at least two options + a selected correct answer) to unlock publishing.`}
        </p>
      </div>

      {filtered.length ? (
        <div className="mt-4 space-y-2">
          {filtered.map((q) => (
            <div key={q.id} className="rounded-xl border border-border-subtle bg-sky-soft p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={q.difficulty === 'easy' ? 'green' : q.difficulty === 'medium' ? 'amber' : 'navy'}>{q.difficulty}</Badge>
                  <p className="text-sm font-medium text-primary-deep">{q.text}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button className="rounded p-1 text-slate-muted hover:text-primary" onClick={() => setEditing(q)}><Edit3 size={15} /></button>
                  <button className="rounded p-1 text-slate-muted hover:text-rose-600" onClick={() => deleteQuestion(course.id, q.id)}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {q.options.map((o, oi) => (
                  <span key={oi} className={`text-xs ${oi === q.answer ? 'font-medium text-emerald-600' : 'text-slate-muted'}`}>
                    {String.fromCharCode(65 + oi)}. {o} {oi === q.answer && '✓'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4"><EmptyState icon={BookOpen} title="No questions in bank" description="Add easy, medium, and hard questions to power the assessment." /></div>
      )}

      {(showAdd || editing) && (
        <QuestionForm
          course={course}
          question={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSave={(q) => {
            if (editing) updateQuestion(course.id, editing.id, q)
            else addQuestion(course.id, q)
            setShowAdd(false)
            setEditing(null)
          }}
        />
      )}
    </Card>
  )
}

function QuestionForm({ course, question, onClose, onSave }) {
  const [form, setForm] = useState({
    text: question?.text || '',
    difficulty: question?.difficulty || 'easy',
    topic: question?.topic || course.title,
    opA: question?.options?.[0] || '',
    opB: question?.options?.[1] || '',
    opC: question?.options?.[2] || '',
    opD: question?.options?.[3] || '',
    answer: question?.answer ?? 0,
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const options = [form.opA, form.opB, form.opC, form.opD]
  const submit = () => {
    if (!form.text.trim() || options.some((o) => !o.trim())) return
    onSave({ text: form.text.trim(), difficulty: form.difficulty, topic: form.topic, options, answer: Number(form.answer), tag: { text: form.topic } })
  }
  return (
    <Modal open onClose={onClose} title={question ? 'Edit Question' : 'Add Question'} size="max-w-xl">
      <div className="space-y-3">
        <Field label="Question Text"><textarea value={form.text} onChange={set('text')} rows={2} className="inp resize-none" placeholder="Enter the question" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Difficulty">
            <select value={form.difficulty} onChange={set('difficulty')} className="inp">
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </Field>
          <Field label="Topic Tag"><input value={form.topic} onChange={set('topic')} className="inp" /></Field>
        </div>
        {['opA', 'opB', 'opC', 'opD'].map((k, i) => (
  <Field key={k} label={`Option ${String.fromCharCode(65 + i)}`}>
    <input
      value={form[k]}
      onChange={set(k)}
      className="inp"
      placeholder={`Option ${String.fromCharCode(65 + i)}`}
    />
  </Field>
))}
        <Field label="Correct Answer">
          <select value={form.answer} onChange={set('answer')} className="inp">
            {[0, 1, 2, 3].map((i) => <option key={i} value={i}>Option {String.fromCharCode(65 + i)}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>{question ? 'Save Changes' : 'Add Question'}</Button>
        </div>
      </div>
      <style>{`.inp{width:100%;border-radius:0.5rem;border:1px solid #DCE6F0;background:#F5F8FC;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#4E84B7;background:#fff}`}</style>
    </Modal>
  )
}

function TrainerAnalytics({ course }) {
  const { traineesForCourse } = useCourses()
  const rows = traineesForCourse(course.id)
  const withScore = rows.filter((e) => e.assessment?.percentage != null)
  const avgScore = withScore.length
    ? Math.round(withScore.reduce((s, e) => s + e.assessment.percentage, 0) / withScore.length)
    : 0
  const completed = rows.filter((e) => e.status === 'completed').length
  const completionRate = rows.length ? Math.round((completed / rows.length) * 100) : 0
  const feedbacks = rows.filter((e) => e.feedback)

  const avgRating = (k) =>
    feedbacks.length
      ? (feedbacks.reduce((s, e) => s + (e.feedback[k] || 0), 0) / feedbacks.length).toFixed(1)
      : '—'
  const avgAll = feedbacks.length
    ? (
        feedbacks.reduce((s, e) => s + (e.feedback.contentDepth || 0) + (e.feedback.trainerDelivery || 0) + (e.feedback.operationalRelevance || 0), 0) /
        (feedbacks.length * 3)
      ).toFixed(1)
    : '—'

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Enrolled Trainees" value={rows.length} />
        <Metric label="Completion Rate" value={`${completionRate}%`} />
        <Metric label="Avg. Assessment" value={avgScore ? `${avgScore}%` : '—'} />
        <Metric label="Feedback Score" value={avgAll !== '—' ? `${avgAll} / 5` : '—'} />
      </div>
      <Card className="p-6">
        <h4 className="font-semibold text-primary-deep">Feedback Ratings</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Factor label="Content Depth" val={avgRating('contentDepth')} />
          <Factor label="Trainer Delivery" val={avgRating('trainerDelivery')} />
          <Factor label="Operational Relevance" val={avgRating('operationalRelevance')} />
        </div>
        <p className="mt-3 text-xs text-slate-muted">
          {feedbacks.length} trainee feedback submission{feedbacks.length === 1 ? '' : 's'} feeding trainer analytics.
        </p>
      </Card>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <Card className="p-5 text-center">
      <p className="text-2xl font-semibold text-primary-deep">{value}</p>
      <p className="text-xs text-slate-muted">{label}</p>
    </Card>
  )
}

function Factor({ label, val }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-sky-soft p-4 text-center">
      <p className="text-2xl font-semibold text-primary">{val}</p>
      <p className="text-xs text-slate-muted">{label}</p>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-primary-deep">{label}</label>
      {children}
    </div>
  )
}

function FileType(mime = '') {
  const m = String(mime).toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('presentation') || m.includes('powerpoint') || m.includes('ppt')) return 'slides'
  if (m.startsWith('image/')) return 'image'
  if (m.includes('video')) return 'video'
  if (m.includes('word') || m.includes('document')) return 'doc'
  return m || 'file'
}

const ACCEPT_HINT = {
  notes: '.pdf,.png,.jpg,.jpeg,.gif,.webp',
  slides: '.ppt,.pptx',
  practice: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.txt',
  videos: 'video/*,.mp4,.webm,.ogg,.mov,.mkv',
}

function acceptFor(section) {
  return ACCEPT_HINT[section] || ''
}

function allowedFor(section) {
  const labels = {
    notes: 'Accepts PDF, PNG, JPG, JPEG, GIF, WEBP study notes.',
    slides: 'Accepts PPT and PPTX slide decks.',
    practice: 'Accepts PDF, PNG, JPG, DOC, DOCX, TXT practice material.',
  }
  return labels[section] || ''
}
