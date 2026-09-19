// Server-side course material format rules.
//
// Mirrors the per-folder allowed formats that the frontend enforces in
// `src/services/cloudinaryService.js` (FOLDER_FORMATS) so the backend upload
// endpoint applies the same contract: notes/practice accept documents and
// images, slides are PPT-only, videos accept actual video files. Keeping both
// copies in sync means an upload that the UI allows is always accepted here too.

export const NOTES_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']
export const SLIDES_EXT = ['ppt', 'pptx']
export const VIDEOS_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv']
export const PRACTICE_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'txt']

const FOLDER_FORMATS = {
  NOTES: {
    exts: NOTES_EXT,
    mime: (m) => m.includes('pdf') || m.startsWith('image/'),
  },
  SLIDES: {
    exts: SLIDES_EXT,
    mime: (m) => m.includes('presentation') || m.includes('powerpoint'),
  },
  VIDEOS: {
    exts: VIDEOS_EXT,
    mime: (m) => m.startsWith('video/'),
  },
  PRACTICE: {
    exts: PRACTICE_EXT,
    mime: (m) => m.includes('pdf') || m.startsWith('image/') || m.includes('word') || m.includes('text') || m.includes('document'),
  },
}

export const FOLDER_DISPLAY = {
  NOTES: 'Study Notes',
  SLIDES: 'Slide Decks',
  VIDEOS: 'Video Lectures',
  PRACTICE: 'Practice Material',
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

// Returns an error message when the file is not allowed for the given section
// type; null when the file is safe to store. `fileName` is the original file
// name and `mimeType` its reported content type.
export function materialForFolderError(sectionType, fileName, mimeType) {
  const rule = FOLDER_FORMATS[sectionType] || FOLDER_FORMATS.NOTES
  const ext = extOf(fileName)
  const mime = String(mimeType || '').toLowerCase()
  const extOk = rule.exts.includes(ext)
  const mimeOk = rule.mime ? rule.mime(mime) : true
  if (extOk || mimeOk) return null
  const allowed = rule.exts.map((e) => e.toUpperCase()).join(', ')
  const label = FOLDER_DISPLAY[sectionType] || sectionType
  return `Unsupported file type. ${label} accepts: ${allowed}.`
}