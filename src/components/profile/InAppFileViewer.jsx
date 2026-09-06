import { useEffect, useState } from 'react'
import { Eye, FileText, Lock, Presentation } from 'lucide-react'
import { Modal, Button } from '../common/ui'

/**
 * In-app file viewer.
 *
 * Opens a file directly inside CAPACITY CONNECT instead of forcing the user out
 * to an external application wherever browser support allows:
 *   - PDFs   -> embedded <iframe>/<embed> viewer
 *   - images -> rendered inline in the modal
 *   - video  -> inline <video> player
 *   - PPT/PPTX -> PowerPoint previewed IN-APP in the same viewer area via the
 *                 Microsoft Office Online viewer, fed with the public Cloudinary
 *                 URL (see notes below)
 *   - other  -> a clear in-app message with an optional controlled download link
 *
 * NOTE on PPT/PPTX: browsers have no native PowerPoint renderer, so the file is
 * rendered inside the same in-app viewer area using Microsoft's Office Online
 * viewer (https://view.officeapps.live.com/op/embed.aspx?src=<encoded URL>),
 * which fetches the PUBLIC Cloudinary PPT/PPTX URL server-side and returns a
 * PowerPoint web preview. The Cloudinary URL is passed URL-encoded and unchanged
 * — no credentials, no re-upload, no client-side conversion, no navigation away.
 * PPT/PPTX is detected SEPARATELY from PDF (extension from the URL and the file
 * name plus the PowerPoint MIME types) and always resolves to the PPT branch — a
 * PowerPoint file is never routed into the PDF viewer. If the Office viewer or
 * the file cannot be reached (probed like the PDF viewer), an honest in-app
 * "Preview unavailable" notice + Download action is shown instead. Download uses
 * Cloudinary's `fl_attachment` delivery flag so the browser saves the real .pptx.
 *
 * NOTE on PDF 401/ACL: a PDF lives in Cloudinary with access control applied
 * (per-asset ACL / authenticated delivery). The browser's PDF plugin then shows
 * "Failed to load PDF document". To avoid that dead error, the PDF source is
 * probed first with a tiny ranged request; a restricted/unavailable source falls
 * back to an honest in-app notice + download action instead of an embedded blob.
 */
export default function InAppFileViewer({ open, onClose, fileURL, fileType, title, fileName }) {
  const kind = fileKind(fileURL, fileType, fileName)
  const isPdf = kind === 'pdf'
  const isImage = kind === 'image'
  const isVideo = kind === 'video'
  const isPpt = kind === 'ppt'
  const downloadable = Boolean(fileURL)

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title={title || 'File'} size="max-w-4xl">
      <div className="space-y-4">
        {isPdf && fileURL && (
          <PdfPreview key={fileURL} fileURL={fileURL} title={title} fileName={fileName} downloadable={downloadable} />
        )}

        {isImage && fileURL && (
          <div className="flex items-center justify-center rounded-xl border border-border-soft bg-sky-soft p-4">
            <img src={fileURL} alt={title || 'Attachment'} className="max-h-[60vh] rounded-lg object-contain" />
          </div>
        )}

        {isVideo && fileURL && (
          <div className="overflow-hidden rounded-xl border border-border-soft bg-black">
            <video src={fileURL} controls className="h-[60vh] w-full max-w-full" />
          </div>
        )}

        {isPpt && fileURL && (
          <OfficePptPreview key={fileURL} fileURL={fileURL} title={title} fileName={fileName} />
        )}

        {!isPdf && !isImage && !isVideo && !isPpt && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-sky-soft p-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-primary">
              {kind === 'locked' ? <Lock size={24} /> : <FileText size={24} />}
            </span>
            {kind === 'locked' ? (
              <>
                <p className="text-sm font-medium text-primary-deep">Preview not available</p>
                <p className="max-w-md text-xs text-slate-muted">
                  This file type cannot be previewed inside CAPACITY CONNECT.
                  {downloadable ? ' You can download it below if needed.' : ''}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-muted">
                This file type cannot be previewed in the browser.
                {downloadable ? ' Use the download option below.' : ''}
              </p>
            )}
            {downloadable && (
              <a
                href={fileURL}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                <FileText size={15} /> Download File
              </a>
            )}
          </div>
        )}

        {(isPdf || isImage || isVideo || isPpt) && (
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-sky-soft px-4 py-3 text-xs text-slate-muted">
            <Eye size={14} className="text-primary" />
            {isPpt ? 'Previewing PowerPoint inside CAPACITY CONNECT.' : 'Previewing inside CAPACITY CONNECT.'}
            {downloadable && (
              <a href={isPpt ? forcedDownloadUrl(fileURL) : fileURL} download target="_blank" rel="noreferrer" className="ml-auto font-medium text-primary hover:underline">
                Download
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="subtle" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  )
}

// PDF preview block. The source is probed with a tiny ranged request BEFORE the
// embedded viewer mounts, so a Cloudinary access-restricted (ACL/authenticated)
// or missing file shows an honest in-app notice instead of the browser's dead
// "Failed to load PDF document" error. Keyed by `fileURL` in the parent so this
// remounts with fresh state for every new file — no stale results on switch.
function PdfPreview({ fileURL, title, fileName, downloadable }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => fetch(fileURL, { headers: { Range: 'bytes=0-1023' }, credentials: 'omit' }))
      .then((r) => {
        if (cancelled) return
        if (r.status === 401 || r.status === 403) setStatus('restricted')
        else if (r.status >= 200 && r.status < 400) setStatus('ok')
        else setStatus('unavailable')
      })
      .catch(() => {
        if (!cancelled) setStatus('unknown')
      })
    return () => {
      cancelled = true
    }
  }, [fileURL])

  if (status === 'restricted' || status === 'unavailable') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-sky-soft p-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-primary">
          <Lock size={24} />
        </span>
        <p className="text-sm font-medium text-primary-deep">{fileName || title || 'Document'}</p>
        <p className="max-w-md text-xs text-slate-muted">
          This PDF is stored inside CAPACITY CONNECT, but the media service blocks delivery of PDF
          files for this account (its security setting restricts PDF delivery by default). The same
          file starts working as soon as an account owner enables{' '}
          “Allow delivery of PDF and ZIP files” in the Cloudinary Console under Settings → Security.
          No re-upload is required after that — the existing file link works immediately.
        </p>
        {downloadable && (
          <a
            href={fileURL}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <FileText size={15} /> Download PDF
          </a>
        )}
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center rounded-xl border border-border-soft bg-sky-soft text-sm text-slate-muted">
        Checking file availability…
      </div>
    )
  }

  // 'ok' (deliverable) or 'unknown' (probe failed — still let the iframe try).
  return (
    <div className="overflow-hidden rounded-xl border border-border-soft">
      <iframe
        title={title || 'Document'}
        src={fileURL}
        className="h-[60vh] w-full bg-sky-soft"
      />
    </div>
  )
}

// PowerPoint preview block. The file is probed (tiny ranged request, same as the
// PDF viewer) before the Microsoft Office Online viewer loads, so a blocked or
// missing file shows an honest in-app "Preview unavailable" notice instead of a
// blank iframe. When available, the presentation renders IN-APP — same modal,
// same viewer area as PDFs — fed with the PUBLIC Cloudinary URL (URL-encoded),
// and Download stays available (secondary) so users can keep the real .pptx.
// Keyed by `fileURL` in the parent so this remounts with fresh state per file.
function OfficePptPreview({ fileURL, title, fileName }) {
  const [status, setStatus] = useState('checking')
  const name = fileName || title || 'PowerPoint presentation'

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => fetch(fileURL, { headers: { Range: 'bytes=0-1023' }, credentials: 'omit' }))
      .then((r) => {
        if (cancelled) return
        if (r.status === 401 || r.status === 403) setStatus('restricted')
        else if (r.status >= 200 && r.status < 400) setStatus('ok')
        else setStatus('unavailable')
      })
      .catch(() => {
        if (!cancelled) setStatus('unknown')
      })
    return () => {
      cancelled = true
    }
  }, [fileURL])

  if (status === 'restricted' || status === 'unavailable') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-sky-soft p-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-primary">
          <Presentation size={24} />
        </span>
        <p className="text-sm font-medium text-primary-deep">Preview unavailable</p>
        <p className="max-w-md text-xs text-slate-muted">
          The Office Online viewer could not reach this presentation in the media service, so an
          on-screen preview is not available for <span className="font-medium text-primary-deep">{name}</span>.
          You can still download the exact PowerPoint file and open it in your installed Office apps.
        </p>
        <a
          href={forcedDownloadUrl(fileURL)}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          <FileText size={15} /> Download PowerPoint
        </a>
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center rounded-xl border border-border-soft bg-sky-soft text-sm text-slate-muted">
        Preparing PowerPoint preview…
      </div>
    )
  }

  // 'ok' (deliverable) or 'unknown' (probe failed — still let the Office viewer try).
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border-soft">
        <iframe
          title={title || name}
          src={officeViewerUrl(fileURL)}
          className="h-[60vh] w-full bg-sky-soft"
          allow="fullscreen"
        />
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-sky-soft px-4 py-3 text-xs text-slate-muted sm:flex-row sm:items-center sm:gap-2">
        <span className="flex items-center gap-2">
          <Eye size={14} className="text-primary" />
          Previewing the presentation inside CAPACITY CONNECT via the Microsoft Office Online viewer.
        </span>
        <a
          href={forcedDownloadUrl(fileURL)}
          download
          className="font-medium text-primary hover:underline sm:ml-auto"
        >
          Download PowerPoint
        </a>
      </div>
      <p className="text-xs text-slate-muted">
        Preview not loading? Download the file to open it in your installed PowerPoint app.
      </p>
    </div>
  )
}

function fileKind(fileURL = '', fileType = '', fileName = '') {
  const mime = String(fileType || '').toLowerCase()
  const urlExt = extFrom(fileURL)
  const nameExt = extFrom(fileName)
  const hasExt = (exts) => exts.includes(urlExt) || exts.includes(nameExt)

  const isImage = mime.includes('image') || hasExt(IMAGE_EXTS)
  const isVideo = mime.includes('video') || hasExt(VIDEO_EXTS)
  const isPpt = /presentation|powerpoint/.test(mime) || hasExt(['ppt', 'pptx'])
  const isPdf = mime === 'application/pdf' || mime.includes('pdf') || urlExt === 'pdf' || nameExt === 'pdf'

  // PDF and PPT signals can both be present in messy metadata; a PowerPoint file
  // is never a PDF, so resolve PPT first. This guarantees a `.ppt`/`.pptx` (or a
  // PowerPoint MIME) always lands in the PPT branch and can never be routed into
  // the PDF viewer / PdfPreview probe.
  if (isPpt) return 'ppt'
  if (isImage) return 'image'
  if (isVideo) return 'video'
  if (isPdf) return 'pdf'
  return 'other'
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'avi', 'm4v', '3gp']

function extFrom(value) {
  const s = String(value || '').toLowerCase()
  return s.includes('.') ? s.split('.').pop() : ''
}

// Microsoft Office Online viewer URL for a publicly accessible file. The embed
// endpoint officially targets iframing (PowerPointView=ChromelessView&Embed=1)
// and resolves the source through Office's WOPI gateway. The source URL must be
// fully URL-encoded so the Cloudinary `fileURL` survives the query string intact.
function officeViewerUrl(fileURL) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileURL)}`
}

// Cloudinary forced-download delivery flag (fl_attachment transformation). Adding
// it makes Cloudinary respond with `Content-Disposition: attachment; filename="…"`
// so clicking Download saves the real file instead of an inline response. Only the
// DOWNLOAD action uses this derived URL — the stored Cloudinary URL is left
// untouched, and non-Cloudinary URLs pass through unchanged.
function forcedDownloadUrl(url = '') {
  if (!url || url.includes('/fl_attachment')) return url
  const match = url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:raw|image|video|auto)\/upload)(\/v\d+)?(\/.*)$/i)
  if (!match) return url
  const [, base, version, path] = match
  return `${base}${version || ''}/fl_attachment${path}`
}
