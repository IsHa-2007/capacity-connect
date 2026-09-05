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
 *   - PPT/PPTX -> internal in-app slide-deck preview panel (browsers cannot
 *                 natively render PowerPoint; see notes below)
 *   - other  -> a clear in-app message with an optional controlled download link
 *
 * NOTE on PPT/PPTX: browsers have no native PowerPoint renderer, and the current
 * frontend architecture has no server-side converter, so a true slide-by-slide
 * preview is not possible without a backend. Instead we keep everything IN-APP:
 * an honest internal "Slide Deck" preview panel (name, type, size, guidance) with
 * a download action. We intentionally do NOT embed Office.com or Google Slides.
 */
export default function InAppFileViewer({ open, onClose, fileURL, fileType, title, fileName }) {
  if (!open) return null

  const kind = fileKind(fileURL, fileType)
  const isPdf = kind === 'pdf'
  const isImage = kind === 'image'
  const isVideo = kind === 'video'
  const isPpt = kind === 'ppt'
  const downloadable = Boolean(fileURL)

  return (
    <Modal open={open} onClose={onClose} title={title || 'File'} size="max-w-4xl">
      <div className="space-y-4">
        {isPdf && fileURL && (
          <div className="overflow-hidden rounded-xl border border-border-soft">
            <iframe
              title={title || 'Document'}
              src={fileURL}
              className="h-[60vh] w-full bg-sky-soft"
            />
          </div>
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

        {isPpt && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-sky-soft p-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-primary">
              <Presentation size={24} />
            </span>
            <p className="text-sm font-medium text-primary-deep">{fileName || title || 'Slide Deck'}</p>
            <p className="max-w-md text-xs text-slate-muted">
              This is a Microsoft PowerPoint file stored inside CAPACITY CONNECT. Browsers cannot
              render PowerPoint slides natively, and no server-side converter is configured, so an
              on-screen slide preview is not available for this file. It is kept entirely within the
              platform — you can safely download and open it in your installed Office apps.
            </p>
            {downloadable && (
              <a
                href={fileURL}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                <FileText size={15} /> Download Slide Deck
              </a>
            )}
          </div>
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
            {isPpt ? 'File is stored and available inside CAPACITY CONNECT.' : 'Previewing inside CAPACITY CONNECT.'}
            {downloadable && (
              <a href={fileURL} download target="_blank" rel="noreferrer" className="ml-auto font-medium text-primary hover:underline">
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

function fileKind(fileURL = '', fileType = '') {
  const ext = String(fileURL || '').split('.').pop().toLowerCase()
  const mime = String(fileType || '').toLowerCase()
  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (mime.includes('video') || ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) return 'video'
  if (mime === 'application/pdf' || mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (mime.includes('presentation') || mime.includes('powerpoint') || mime.includes('ms-powerpoint') || ['ppt', 'pptx'].includes(ext)) return 'ppt'
  return 'other'
}
