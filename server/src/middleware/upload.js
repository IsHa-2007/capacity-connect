import multer from 'multer'
import { ApiError } from '../utils/apiResponse.js'

export const MATERIAL_UPLOAD_MAX_BYTES = 200 * 1024 * 1024

// Defense-in-depth: even though materialRules already rejects every extension
// below for every folder, rejecting them at the multer layer protects the
// memory buffer against obviously-executable payloads BEFORE the file is
// staged. This deny-list can never reject a legitimate lesson document because
// none of these types are accepted by any SECTION_TYPES folder rule.
const FORBIDDEN_EXTENSIONS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'mjs', 'cjs',
  'sh', 'py', 'pl', 'rb', 'php', 'jar', 'dll', 'so', 'dylib', 'class',
  'apk', 'msix', 'html', 'htm', 'svg',
])

export function fileFilter(_req, file, cb) {
  const parts = String(file.originalname || '').toLowerCase().split('.')
  const candidate = parts.length > 1 ? parts.pop() : ''
  if (FORBIDDEN_EXTENSIONS.has(candidate)) {
    return cb(new ApiError(400, 'FILE_TYPE_UNSUPPORTED', 'This file type is not supported.'))
  }
  return cb(null, true)
}

const storage = multer.memoryStorage()

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: MATERIAL_UPLOAD_MAX_BYTES, files: 1 },
})

export const uploadMaterialFile = uploader.single('file')

export function uploadError(err, _req, _res, next) {
  if (!err) return next()
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new ApiError(
          413,
          'FILE_TOO_LARGE',
          `The uploaded file exceeds the ${Math.round(MATERIAL_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`,
        ),
      )
    }
    return next(new ApiError(400, 'FILE_UPLOAD_INVALID', err.message))
  }
  return next(err)
}