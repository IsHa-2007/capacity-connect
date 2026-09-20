import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

// Only the server-side Storage abstraction is defined here.
// No files were migrated in Module 4 and the bucket is not created here:
// the private "capacity-connect" bucket is provisioned by the storage/database
// module. This service fails clearly when the bucket does not exist rather
// than silently creating a public bucket.

export const STORAGE_BUCKET = 'capacity-connect'

async function assertBucketExists() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets()
  if (error) {
    throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Unable to reach Supabase Storage.', {
      dbCode: error.code,
      dbMessage: error.message,
    })
  }
  const exists = buckets?.some((bucket) => bucket.name === STORAGE_BUCKET)
  if (!exists) {
    throw new ApiError(
      503,
      'STORAGE_BUCKET_NOT_READY',
      `Private storage bucket "${STORAGE_BUCKET}" does not exist yet. It is provisioned by the storage/database migration module — the backend never auto-creates it.`,
    )
  }
  return STORAGE_BUCKET
}

export async function upload({ path, body, contentType, metadata }) {
  await assertBucketExists()
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, body, { contentType, upsert: false, metadata })
  if (error) throw new ApiError(400, 'STORAGE_UPLOAD_FAILED', error.message)
  return data
}

export async function createSignedUrl(path, expiresInSeconds = 3600) {
  await assertBucketExists()
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error) throw new ApiError(400, 'STORAGE_SIGNED_URL_FAILED', error.message)
  // Supabase returns { data: { signedUrl } }. Resolve to the STRING here so
  // every caller receives the actual fetchable URL — never the wrapper object.
  return data?.signedUrl ?? null
}

export async function remove(paths) {
  await assertBucketExists()
  const list = Array.isArray(paths) ? paths : [paths]
  const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(list)
  if (error) throw new ApiError(400, 'STORAGE_DELETE_FAILED', error.message)
}