import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Layers, Lock, Plus, Search, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCourses } from '../../context/CourseContext'
import { Card, Button, Badge, Modal, EmptyState } from '../common/ui'
import CourseManagement from './CourseManagement'
import { DOMAINS } from '../../data/mockData'

export default function MyCoursesView() {
  const navigate = useNavigate()
  const { myCourses, traineesForCourse, createCourse } = useCourses()
  const { currentUser } = useAuth()
  const { courseId } = useParams()
  const [params] = useSearchParams()
  const [showCreate, setShowCreate] = useState(params.get('new') === '1')
  const [query, setQuery] = useState('')

  const isPending = currentUser?.status === 'pending'

  const filtered = myCourses.filter(
    (c) =>
      !query ||
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.domain.toLowerCase().includes(query.toLowerCase()),
  )

  // route-level course management via :courseId path param
  if (courseId) {
    const c = myCourses.find((x) => x.id === courseId)
    if (c) return <CourseManagement courseId={courseId} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary-deep">My Courses</h2>
          <p className="text-sm text-slate-muted">Manage your scientific training courses and materials.</p>
        </div>
        <Button disabled={isPending} onClick={() => setShowCreate(true)}><Plus size={16} /> Create New Course</Button>
      </div>

      {isPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <Lock size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Your account is awaiting administrative approval.</p>
            <p className="mt-0.5">
              Operational features will unlock after verification. Course creation, publishing,
              materials, and question banks are unavailable until then.
            </p>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your courses..."
          className="w-full rounded-lg border border-border-soft bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-secondary"
        />
      </div>

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-light text-primary"><Layers size={20} /></span>
                  <div>
                    <Badge>{c.domain}</Badge>
                    <h4 className="mt-1 font-semibold text-primary-deep">{c.title}</h4>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-muted">
                <span className="inline-flex items-center gap-1"><Users size={13} /> {traineesForCourse(c.id).length} enrolled</span>
                <span><Badge tone={c.status === 'published' ? 'green' : 'slate'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge></span>
              </div>
              <button
                onClick={() => navigate(`/trainer/courses/${c.id}`)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-sky-light px-3 py-2 text-sm font-medium text-primary hover:bg-blue-100"
              >
                Manage Course <ArrowRight size={15} />
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={Layers} title="No courses found" description="Create a course or adjust your search." /></Card>
      )}

      <CreateCourseModal
        open={showCreate && !isPending}
        onClose={() => setShowCreate(false)}
        onCreate={(id) => {
          setShowCreate(false)
          navigate(`/trainer/courses/${id}`)
        }}
        createCourse={createCourse}
      />
    </div>
  )
}

function StatusBadge({ status }) {
  return <Badge tone={status === 'published' ? 'green' : 'slate'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
}

function CreateCourseModal({ open, onClose, onCreate, createCourse }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    domain: DOMAINS[0],
    subdomain: '',
    audience: '',
    difficulty: 'Beginner',
    duration: '4 weeks',
    tags: '',
    prerequisites: '',
    objectives: '',
    syllabus: '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = () => {
    if (!form.title.trim()) return
    const created = createCourse({
      title: form.title.trim(),
      description: form.description.trim(),
      domain: form.domain,
      subdomain: form.subdomain.trim(),
      audience: form.audience.trim(),
      difficulty: form.difficulty,
      duration: form.duration,
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      // New courses always start as DRAFT; publishing runs through the validated
      // publish flow which requires only the minimum course identity
      // (title / description / domain). Learning material is added at the
      // trainer's own pace and is never a hard publishing requirement.
      status: 'draft',
      objectives: form.objectives.split('\n').map((s) => s.trim()).filter(Boolean),
      syllabus: form.syllabus.split('\n').map((s) => s.trim()).filter(Boolean),
      prerequisites: form.prerequisites.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    if (created) onCreate(created.id)
  }

  return (
    <Modal open={open} onClose={onClose} title="Create New Course" size="max-w-2xl">
      <div className="space-y-6">
        {/* Basics */}
        <section>
          <SectionTitle step="1" title="Course Basics" hint="Core identity shown throughout the platform." />
          <div className="space-y-4">
            <Field label="Course Title *">
              <input value={form.title} onChange={set('title')} placeholder="e.g. Advanced Mesoscale Modeling" className="inp" />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Describe the scientific scope and what learners will gain" className="inp resize-none" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Domain *">
                <select value={form.domain} onChange={set('domain')} className="inp">
                  {DOMAINS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Sub-domain (optional)">
                <input value={form.subdomain} onChange={set('subdomain')} placeholder="e.g. Doppler Radar" className="inp" />
              </Field>
            </div>
            <Field label="Target Audience (optional)">
              <input value={form.audience} onChange={set('audience')} placeholder="e.g. Meteorologists Grade-II, forecast officers" className="inp" />
            </Field>
          </div>
        </section>

        {/* Structured learning */}
        <section>
          <SectionTitle step="2" title="Structured Learning" hint="Level, pace, and discoverability." />
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
          <div className="mt-4">
            <Field label="Tags (comma-separated)">
              <input value={form.tags} onChange={set('tags')} placeholder="e.g. NWP, DWR, forecasting" className="inp" />
            </Field>
          </div>
        </section>

        {/* Curriculum */}
        <section>
          <SectionTitle step="3" title="Curriculum & Prerequisites" hint="Optional — you can add these anytime before publishing." />
          <div className="space-y-4">
            <Field label="Learning Objectives (one per line)">
              <textarea value={form.objectives} onChange={set('objectives')} rows={2} placeholder="Understand X&#10;Apply Y" className="inp resize-none" />
            </Field>
            <Field label="Syllabus Topics (one per line)">
              <textarea value={form.syllabus} onChange={set('syllabus')} rows={2} placeholder="Introduction&#10;Advanced topic" className="inp resize-none" />
            </Field>
            <Field label="Prerequisites (one per line)">
              <textarea value={form.prerequisites} onChange={set('prerequisites')} rows={2} placeholder="Basic meteorology&#10;Familiarity with radar interpretation" className="inp resize-none" />
            </Field>
          </div>
        </section>

        <p className="rounded-xl bg-sky-soft px-4 py-3 text-xs leading-relaxed text-slate-body">
          The course is created as a <span className="font-medium text-primary-deep">draft</span> (visible only to you).
          Add materials, slides, videos, practice, and question bank in course management,
          then publish it to the catalog. Only the title, description, and domain are required to publish.
        </p>

        <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create Course</Button>
        </div>
      </div>
      <style>{`.inp{width:100%;border-radius:0.5rem;border:1px solid #DCE6F0;background:#F5F8FC;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.inp:focus{border-color:#4E84B7;background:#fff}`}</style>
    </Modal>
  )
}

function SectionTitle({ step, title, hint }) {
  return (
    <div className="mb-3 flex items-center gap-3 border-b border-border-soft pb-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-white">{step}</span>
      <div>
        <p className="text-sm font-semibold text-primary-deep">{title}</p>
        <p className="text-xs text-slate-muted">{hint}</p>
      </div>
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
