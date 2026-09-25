import { useEffect, useState } from 'react'
import { Award, CheckCircle2, Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, Card, Badge } from '../../common/ui'
import { exportCertificatePDF } from '../../../utils/pdfExport'
import { getEnrollmentCertificate } from '../../../services/certificateApi.js'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CertificateView({ course, enrollmentId }) {
  const [request, setRequest] = useState({ enrollmentId: null, loading: true, cert: null, error: null })

  useEffect(() => {
    if (!enrollmentId) return undefined
    let cancelled = false
    getEnrollmentCertificate(enrollmentId)
      .then((cert) => {
        if (!cancelled) setRequest({ enrollmentId, loading: false, cert, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setRequest({
            enrollmentId,
            loading: false,
            cert: null,
            error: err?.message || 'No certificate available yet.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enrollmentId])

  const loading = !enrollmentId ? false : request.enrollmentId !== enrollmentId || request.loading
  const data = request.enrollmentId === enrollmentId ? request.cert : null
  const error = request.enrollmentId === enrollmentId ? request.error : null

  const retry = () => {
    if (!enrollmentId) return
    setRequest((prev) => ({ ...prev, loading: true, error: null }))
    getEnrollmentCertificate(enrollmentId)
      .then((cert) => setRequest({ enrollmentId, loading: false, cert, error: null }))
      .catch((err) => {
        setRequest({
          enrollmentId,
          loading: false,
          cert: null,
          error: err?.message || 'No certificate available yet.',
        })
      })
  }

  if (!enrollmentId) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-slate-body">No certificate available yet. Complete the feedback to unlock it.</p>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-sm text-center">
          <RefreshCw size={22} className="mx-auto animate-spin text-primary" />
          <h3 className="mt-4 text-lg font-semibold text-primary-deep">Retrieving your certificate…</h3>
          <p className="mt-1 text-sm text-slate-body">Fetching your verified certificate from the platform.</p>
        </div>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className="p-8">
        <div className="mx-auto max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary"><Award size={26} /></span>
          <h3 className="mt-4 text-lg font-semibold text-primary-deep">Certificate not available</h3>
          <p className="mt-1 text-sm text-slate-body">{error || 'No certificate has been issued for this enrollment yet.'}</p>
          <button
            onClick={retry}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      </Card>
    )
  }

  const cert = data.certificate || {}
  const trainee = data.trainee || {}
  const courseInfo = data.course || {}
  const assessment = data.assessment || {}
  const verification = data.verification || {}

  const certificateNumber = cert.certificateNumber || cert.id
  const traineeName = trainee.name || 'Trainee'
  const courseName = courseInfo.title || course?.title || 'Course'
  const courseDomain = courseInfo.domain || course?.domain || ''
  const issuedOn = cert.issuedOn
  const percentage = assessment.percentage ?? null

  const handleExport = () => {
    exportCertificatePDF({
      traineeName,
      courseName,
      completionDate: issuedOn,
      certId: certificateNumber,
      trainer: course?.trainer || '',
      score: percentage ?? 0,
    })
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Award className="text-primary" size={20} />
            <div>
              <h3 className="font-semibold text-primary-deep">Verified Certificate</h3>
              <p className="text-xs text-slate-muted">Your certificate has been synchronized to your profile.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone="green"><CheckCircle2 size={13} /> {verification.issuer || 'Verified'}</Badge>
            <Button onClick={handleExport} variant="secondary"><Download size={16} /> Export PDF</Button>
          </div>
        </div>
      </Card>

      {/* Certificate */}
      <Card className="p-8">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border-4 border-double border-primary/60 bg-gradient-to-br from-white to-sky-light px-10 py-8 text-center">
          {/* watermark */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ShieldCheck size={320} className="text-primary" />
            </div>
          </div>

          {/* Logos + brand */}
          <div className="relative flex items-center justify-between">
            <LogoBadge label="IMD" />
            <div>
              <p className="text-lg font-bold tracking-[0.3em] text-primary-deep">CAPACITY CONNECT</p>
              <p className="text-[11px] tracking-widest text-slate-muted">INDIA METEOROLOGICAL DEPARTMENT · MINISTRY OF EARTH SCIENCES</p>
            </div>
            <LogoBadge label="MoES" />
          </div>

          <div className="relative mt-6">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-secondary">Certificate of Completion</p>
            <p className="mt-2 text-xs uppercase tracking-widest text-slate-muted">of scientific capacity & training readiness</p>

            <div className="mx-auto mt-6 border-b-2 border-border-soft sm:w-96">
              <p className="pb-2 text-3xl font-serif font-semibold text-primary-deep">{traineeName}</p>
            </div>

            <p className="mt-6 text-sm text-slate-body">has successfully completed the verified program</p>
            <p className="mt-2 text-xl font-semibold text-primary-deep">{courseName}</p>
            {courseDomain && <p className="mt-2 text-xs text-slate-muted">Scientific domain: {courseDomain}</p>}

            <div className="mt-6 flex items-center justify-center gap-2">
              <Badge tone="green"><CheckCircle2 size={13} /> Final Assessment Score: {percentage != null ? `${percentage}%` : '—'}</Badge>
            </div>

            <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-muted">Certificate ID</p>
                <p className="text-sm font-semibold text-primary-deep">{certificateNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-muted">Issue Date</p>
                <p className="text-sm font-semibold text-primary-deep">{formatDate(issuedOn)}</p>
              </div>
            </div>
          </div>

          {/* Signature area */}
          <div className="relative mt-8 flex items-end justify-between">
            <div className="text-left">
              <div className="w-40 border-t border-slate-body pt-1.5">
                <p className="text-xs text-slate-body">{course?.trainer || '—'}</p>
                <p className="text-[10px] text-slate-muted">Course Trainer</p>
              </div>
            </div>
            <div className="text-right">
              <div className="w-40 border-t border-slate-body pt-1.5">
                <p className="text-xs text-slate-body">Director, Capacity Building</p>
                <p className="text-[10px] text-slate-muted">Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 text-sm text-slate-body">
          <FileText size={16} className="text-primary" />
          Certificate {certificateNumber} is issued by {verification.issuer || 'Capacity Connect'}. This certificate has been added to your profile and competency record. Use the Export PDF button to save or print it.
        </p>
      </Card>
    </div>
  )
}

function LogoBadge({ label }) {
  return (
    <div className="grid h-14 w-14 place-items-center rounded-full border-2 border-primary/40 bg-white text-xs font-bold text-primary uppercase">
      {label}
    </div>
  )
}