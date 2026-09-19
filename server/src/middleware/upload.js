import multer from 'multer'
import { ApiError } from '../utils/apiResponse.js'

export const MATERIAL_UPLOAD_MAX_BYTES = 200 * 1024 * 1024

const storage = multer.memoryStorage()

const uploader = multer({
  storage,
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