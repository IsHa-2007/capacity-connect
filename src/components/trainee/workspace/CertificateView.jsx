import { Award, CheckCircle2, Download, FileText, ShieldCheck } from 'lucide-react'
import { Button, Card, Badge } from '../../common/ui'
import { exportCertificatePDF } from '../../../utils/pdfExport'

export default function CertificateView({ course, enrollment, user }) {
  const cert = enrollment?.certificate
  const assessment = enrollment?.assessment

  if (!cert) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-slate-body">No certificate available yet. Complete the feedback to unlock it.</p>
      </Card>
    )
  }

  const handleExport = () => {
    exportCertificatePDF({
      traineeName: user?.name || 'Trainee',
      courseName: course.title,
      completionDate: cert.issuedOn,
      certId: cert.id,
      trainer: course.trainer,
      score: assessment?.percentage || 82,
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
            <Badge tone="green"><CheckCircle2 size={13} /> Verified</Badge>
            <Button onClick={handleExport} variant="secondary"><Download size={16} /> Export PDF</Button>
          </div>
        </div>
      </Card>

      {/* Certificate */}
      <Card className="p-8">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border-4 border-double border-primary/60 bg-gradient-to-br from-white to-sky-light p-10 text-center">
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

          <div className="relative mt-10">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-secondary">Certificate of Completion</p>
            <p className="mt-2 text-xs uppercase tracking-widest text-slate-muted">of scientific capacity & training readiness</p>

            <div className="mx-auto mt-6 border-b-2 border-border-soft sm:w-80">
              <p className="pb-2 text-3xl font-serif font-semibold text-primary-deep">{user?.name || 'Trainee'}</p>
            </div>

            <p className="mt-6 text-sm text-slate-body">has successfully completed the verified program</p>
            <p className="mt-2 text-xl font-semibold text-primary-deep">{course.title}</p>
            <p className="mt-2 text-xs text-slate-muted">Scientific domain: {course.domain}</p>

            <div className="mt-6 flex items-center justify-center gap-2">
              <Badge tone="green"><CheckCircle2 size={13} /> Final Assessment Score: {assessment?.percentage || 82}%</Badge>
            </div>

            <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-muted">Certificate ID</p>
                <p className="text-sm font-semibold text-primary-deep">{cert.id}</p>
              </div>
              <div>
                <p className="text-xs text-slate-muted">Issue Date</p>
                <p className="text-sm font-semibold text-primary-deep">{cert.issuedOn}</p>
              </div>
            </div>
          </div>

          {/* Signature area */}
          <div className="relative mt-10 flex items-end justify-between">
            <div className="text-left">
              <div className="w-40 border-t border-slate-body pt-1.5">
                <p className="text-xs text-slate-body">{course.trainer}</p>
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
          This certificate has been added to your profile and competency record. Use the Export PDF button to save or print it.
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
