import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Clock,
  CloudSun,
  Globe2,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react'
import { useCourses } from '../context/CourseContext'
import { useAuth } from '../context/AuthContext'

export default function LandingDashboard() {
  const { currentUser } = useAuth()
  const { courses } = useCourses()
  const navigate = useNavigate()
  const publicCourses = courses.filter((c) => c.status === 'published')
  return (
    <div className="min-h-screen bg-sky-soft">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
              <CloudSun size={20} />
            </span>
            <span className="font-semibold tracking-wide text-primary-deep">
              CAPACITY&nbsp;CONNECT
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="hidden text-sm font-medium text-slate-body hover:text-primary sm:block"
            >
              Sign in
            </Link>
            <Link
              to="/auth?mode=register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-[0_2px_6px_rgba(31,95,147,0.25)] hover:bg-primary-dark"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-24 h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
          <div className="absolute -left-24 top-40 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-sky-light px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck size={14} /> For IMD & MoES
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-primary-deep sm:text-5xl">
                Scientific Capacity
                <br />
                Building & Readiness
              </h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-body">
                Strengthening the meteorological workforce across India with measurable
                competencies, dynamic assessments, verified certifications, and strategic
                regional readiness insights.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/auth?mode=register"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
                >
                  Join the Platform <ArrowRight size={16} />
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-white px-5 py-2.5 text-sm font-medium text-primary hover:bg-sky-light"
                >
                  Sign in
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="rounded-2xl border border-border-soft bg-white p-6 shadow-[0_8px_30px_rgba(31,95,147,0.08)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-primary-deep">Workforce Readiness Targets</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Targets
                  </span>
                </div>
                <div className="mt-5 space-y-4">
                  <MetricRow label="Verified Personnel" value="2,400+" icon={<Users size={16} />} />
                  <MetricRow label="Scientific Courses" value="48" icon={<BookOpen size={16} />} />
                  <MetricRow label="Avg. Competency" value="74%" icon={<BarChart3 size={16} />} />
                  <MetricRow label="Regional Stations" value="36" icon={<Globe2 size={16} />} />
                  <MetricRow label="Certifications Issued" value="1,860" icon={<Award size={16} />} />
                </div>
                <p className="mt-4 text-xs text-slate-muted">
                  Illustrative programme targets — live platform figures appear as regional onboarding completes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold text-primary-deep">
          Measurable capability, not passive consumption
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-body">
          Transform training into operational readiness with a capability-driven ecosystem.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ValueCard icon={Target} title="Dynamic Assessments" text="20:30:50 difficulty engine with strict negative marking." />
          <ValueCard icon={BadgeCheck} title="Verified Certificates" text="Unique IDs, PDF export, and profile synchronization." />
          <ValueCard icon={BarChart3} title="Skill Gap Analysis" text="Regional heatmaps and competency intelligence for planners." />
          <ValueCard icon={Users} title="Trainer Matching" text="Weighted engine recommending the right expert for every course." />
        </div>
      </section>

      {/* Workflow */}
      <section className="border-y border-border-subtle bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold text-primary-deep">
            A complete learning journey
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
            {[
              'Study Notes',
              'Slide Decks',
              'Video Lectures',
              'Practice Sets',
              'Assessment',
              'Feedback',
              'Verified Certificate',
            ].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-3">
                <span className="rounded-lg border border-border-soft bg-sky-soft px-3 py-1.5 font-medium text-primary-deep">
                  {s}
                </span>
                {i < arr.length - 1 && <ArrowRight size={16} className="text-slate-muted" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Public course catalog */}
      <section className="border-t border-border-subtle bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-primary-deep">Explore the Training Catalog</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-body">
                Browse published scientific courses. Sign in to enroll and track your competency.
              </p>
            </div>
            <Link to="/auth" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              Sign in to enroll <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {publicCourses.map((c) => (
              <div key={c.id} className="flex flex-col rounded-2xl border border-border-soft bg-white p-6 shadow-[0_6px_20px_rgba(31,95,147,0.06)]">
                <div className="flex items-center justify-between">
                  <BadgeLabel>{c.domain}</BadgeLabel>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-muted"><Clock size={13} /> {c.duration}</span>
                </div>
                <h3 className="mt-4 font-semibold text-primary-deep">{c.title}</h3>
                <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-slate-body">{c.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <BadgeLabel tone="sky">{c.difficulty}</BadgeLabel>
                  {Array.isArray(c.objectives) && c.objectives.length > 0 && <BadgeLabel tone="sky">{c.objectives.length} objectives</BadgeLabel>}
                </div>
                <button
                  onClick={() => navigate(currentUser ? '/home' : '/auth')}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-sky-light px-3 py-2 text-sm font-medium text-primary hover:bg-blue-100"
                >
                  {currentUser ? 'Go to My Dashboard' : 'Sign in to Enroll'} <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
          {publicCourses.length === 0 && (
            <p className="mt-8 text-sm text-slate-muted">No published courses available yet.</p>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary p-10 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-20">
            <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-white blur-2xl" />
          </div>
          <h3 className="relative text-2xl font-semibold text-white">
            Ready to build verified scientific capacity?
          </h3>
          <p className="relative mx-auto mt-2 max-w-xl text-sm text-blue-100">
            Join India's meteorological workforce readiness platform today.
          </p>
          <Link
            to="/auth?mode=register"
            className="relative mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-primary hover:bg-sky-light"
          >
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border-subtle py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-muted sm:flex-row sm:px-6">
          <span>© 2026 CAPACITY CONNECT · India Meteorological Department · Ministry of Earth Sciences</span>
          <span>Government Scientific Capacity Building & Readiness Platform</span>
        </div>
      </footer>
    </div>
  )
}

function MetricRow({ label, value, icon }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-sky-soft px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-slate-body">
        {icon} {label}
      </span>
      <span className="text-sm font-semibold text-primary-deep">{value}</span>
    </div>
  )
}

function ValueCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-6 transition-shadow hover:shadow-[0_6px_20px_rgba(31,95,147,0.08)]">
      <div className="rounded-xl bg-sky-light p-3 text-primary" style={{ width: 'fit-content' }}>
        <Icon size={20} />
      </div>
      <h3 className="mt-4 font-semibold text-primary-deep">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-body">{text}</p>
    </div>
  )
}

function BadgeLabel({ children, tone = 'default' }) {
  const styles =
    tone === 'sky'
      ? 'bg-sky-light text-primary'
      : 'bg-blue-50 text-primary'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  )
}
