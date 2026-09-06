// Centralized Cloudinary upload service for CAPACITY CONNECT.
//
// All file uploads (profile photos, course content: study notes / slides /
// videos / practice) flow through this single module. Components must NOT
// duplicate Cloudinary upload logic elsewhere.
//
// Security model:
//   - Uses an UNSIGNED upload preset (VITE_CLOUDINARY_UPLOAD_PRESET) so the
//     browser can upload directly to Cloudinary without exposing the API secret.
//   - The Cloudinary API Secret is NEVER placed in frontend code or env vars.
//   - File type/size are validated in the frontend before upload AND the
//     Cloudinary upload preset should enforce the same restrictions server-side.
//
// When Cloudinary is not configured, this service transparently falls back to a
// temporary in-memory object URL (development mock only) so the app remains
// runnable, mirroring the existing Firebase mock behaviour.

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

// True only when both Cloudinary cloud name + upload preset are present.
export function isCloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET)
}

export function getCloudinaryConfig() {
  return { cloudName: CLOUD_NAME, uploadPreset: UPLOAD_PRESET }
}

// Determine Cloudinary resource_type from a file's MIME / extension.
//   - videos    -> "video"
//   - images    -> "image"
//   - everything else (pdf, pptx, docx, txt) -> "raw"
export function resourceTypeFor(file = {}) {
  const mime = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  const ext = name.split('.').pop() || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'avif']
  const videoExts = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'avi', 'm4v', '3gp']
  if (mime.startsWith('video/') || videoExts.includes(ext)) return 'video'
  if (mime.startsWith('image/') || imageExts.includes(ext)) return 'image'
  return 'raw'
}

const MOCK_BLOB_URLS = new Map()

function mockBlobUrlFor(file) {
  const key = `${file.name}:${file.size}:${file.lastModified}`
  let url = MOCK_BLOB_URLS.get(key)
  if (!url) {
    url = URL.createObjectURL(file)
    MOCK_BLOB_URLS.set(key, url)
  }
  return url
}

function extOf(name = '') {
  const parts = String(name).split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext : 'bin'
}

function safeToken(seed) {
  return (seed || 'f') + '-' + Math.random().toString(36).slice(2, 10)
}

/**
 * Upload a file to Cloudinary using the unsigned upload preset.
 *
 * @param {File}   file     The file to upload.
 * @param {object} opts
 *   @param {string} opts.folder  Cloudinary folder name, e.g. 'courses/{courseId}/notes'
 *                                or 'profiles/{uid}'. Used for logical organisation
 *                                and course isolation.
 *   @param {string} [opts.publicId] Optional explicit public_id. When omitted,
 *                                Cloudinary generates one.
 *   @param {string} [opts.resourceType] Override resource_type (defaults from file).
 *   @param {object} [opts.metadata={}] Extra fields merged as data (must be
 *                                strings, numbers or booleans).
 *
 * @returns {Promise<{
 *   secure_url: string,
 *   public_id: string,
 *   resource_type: string,
 *   original_filename: string,
 *   format: string,
 *   bytes: number,
 *   duration: number|null,
 *   fileURL: string,        // alias of secure_url
 *   fileType: string,       // original MIME or extension
 *   storagePath: string,    // Cloudinary public_id (used for cleanup)
 * }>}
 */
export async function uploadToCloudinary(file, { folder, publicId, resourceType, metadata = {} } = {}) {
  if (!file) throw new Error('No file provided.')

  // Fallback to in-memory object URL when Cloudinary is not configured
  // (development-only, session-only, never persisted).
  if (!isCloudinaryConfigured()) {
    return {
      secure_url: mockBlobUrlFor(file),
      public_id: publicId || `mock:${safeToken('m')}`,
      resource_type: resourceType || resourceTypeFor(file),
      original_filename: file.name,
      format: extOf(file.name),
      bytes: file.size,
      duration: null,
      fileURL: mockBlobUrlFor(file),
      fileType: file.type || extOf(file.name),
      storagePath: publicId || `mock:${folder || ''}`,
    }
  }

  const type = resourceType || resourceTypeFor(file)
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)
  if (folder) formData.append('folder', folder)
  if (publicId) formData.append('public_id', publicId)
  // Attach metadata as stringified data_* fields so it is available later.
  Object.entries(metadata).forEach(([k, v]) => {
    if (v !== undefined && v !== null) formData.append(`data_${String(k).toLowerCase()}`, String(v))
  })

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type}/upload`

  const resp = await fetch(url, { method: 'POST', body: formData })
  if (!resp.ok) {
    let detail = ''
    try {
      const errBody = await resp.json()
      detail = errBody?.error?.message || ''
    } catch {
      /* ignore parse error */
    }
    throw new Error(`Cloudinary upload failed (${resp.status})${detail ? `: ${detail}` : ''}.`)
  }

  const data = await resp.json()
  return {
    secure_url: data.secure_url || data.url,
    public_id: data.public_id || '',
    resource_type: data.resource_type || type,
    original_filename: data.original_filename || file.name,
    format: data.format || extOf(file.name),
    bytes: data.bytes ?? file.size,
    duration: data.duration != null ? Number(data.duration) : null,
    fileURL: data.secure_url || data.url,
    fileType: file.type || extOf(file.name),
    storagePath: data.public_id || '',
  }
}

// Best-effort destroy of a Cloudinary asset by public_id.
// An unsigned preset CANNOT destroy assets (destroy requires signature). This is
// a no-op placeholder: asset cleanup from the client is intentionally not
// supported for unsigned uploads. For real cleanup, use the Admin SDK/server.
export async function deleteFromCloudinary(publicId) {
  if (!publicId || publicId.startsWith('mock:')) return
  // Unsigned uploads cannot delete via the browser without exposing the API
  // secret. Log a warning so callers know the object remains in the Cloudinary
  // media library until removed via the Console or a signed server action.
  // eslint-disable-next-line no-console
  console.warn(`[Cloudinary] Deletion of "${publicId}" requires a signed request. Manage it in the Cloudinary Console or a backend routine.`)
}

// Validate an image for profile-avatar uploads.
export function validateImageFile(file, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (!file) return 'No file selected.'
  if (!String(file.type || '').startsWith('image/')) return 'Please choose an image file (JPG, PNG, WebP, etc.).'
  if (file.size > maxBytes) return `Image must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`
  return null
}

// Validate a course content file against the per-folder allowed formats.
// Mirrors the existing courseService.forFolderError rules so slides stay PPT-only,
// notes/practice accept documents, and videos accept actual video files.
const FOLDER_FORMATS = {
  notes: {
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'],
    mime: (m) => m.includes('pdf') || m.startsWith('image/'),
  },
  slides: {
    exts: ['ppt', 'pptx'],
    mime: (m) => m.includes('presentation') || m.includes('powerpoint'),
  },
  videos: {
    exts: ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv'],
    mime: (m) => m.startsWith('video/'),
  },
  practice: {
    exts: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'doc', 'docx', 'txt'],
    mime: (m) => m.includes('pdf') || m.startsWith('image/') || m.includes('word') || m.includes('text') || m.includes('document'),
  },
}

export function courseFolderError(folder, file) {
  if (!file) return null
  const rule = FOLDER_FORMATS[folder] || FOLDER_FORMATS.notes
  const ext = extOf(file.name)
  const mime = String(file.type || '').toLowerCase()
  const extOk = rule.exts.includes(ext)
  const mimeOk = rule.mime ? rule.mime(mime) : true
  if (extOk || mimeOk) return null
  const allowed = rule.exts.map((e) => e.toUpperCase()).join(', ')
  const folderDisplay = { notes: 'Study Notes', slides: 'Slide Decks', videos: 'Video Lectures', practice: 'Practice Material' }[folder] || folder
  return `Unsupported file type. ${folderDisplay} accepts: ${allowed}.`
}
