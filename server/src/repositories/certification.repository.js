// MODULE 17 — USER-CERTIFICATION REPOSITORY (public.user_certifications)
//
// Self-added professional certifications, separate from platform-issued
// certificates (public.certificates, Module 12). All mutations are scoped by
// user_id (ownership is enforced at the service layer and never client-sent);
// reads also carry an owner filter unless the caller is explicitly granted a
// profile-level view.

import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ApiError } from '../utils/apiResponse.js'

const CERT_COLUMNS =
  'id, user_id, certification_name, issuer, obtained_date, expiry_date, credential_id, credential_url, storage_bucket, storage_path, mime_type, file_size, original_filename, created_at'

export function toCertification(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    certificationName: row.certification_name,
    issuer: row.issuer,
    obtainedDate: row.obtained_date,
    expiryDate: row.expiry_date,
    credentialId: row.credential_id,
    credentialUrl: row.credential_url,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
    createdAt: row.created_at,
  }
}

function asCertError(operation, error) {
  return new ApiError(500, `CERTIFICATION_${operation.toUpperCase()}_UNEXPECTED`, 'The certification could not be saved. Please try again.', {
    dbCode: error?.code,
    dbMessage: error?.message,
  })
}

export async function listCertifications({ userId, limit = 50 }) {
  const { data, error } = await supabaseAdmin
    .from('user_certifications')
    .select(CERT_COLUMNS)
    .eq('user_id', userId)
    .order('obtained_date', { ascending: false })
    .limit(limit)
  if (error) throw asCertError('list', error)
  return data || []
}

export async function insertCertification(row) {
  const { data, error } = await supabaseAdmin
    .from('user_certifications')
    .insert(row)
    .select(CERT_COLUMNS)
    .single()
  if (error) throw asCertError('create', error)
  return data
}

export async function findCertification({ userId, certificationId }) {
  const { data, error } = await supabaseAdmin
    .from('user_certifications')
    .select(CERT_COLUMNS)
    .eq('id', certificationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw asCertError('lookup', error)
  return data
}

export async function updateCertification({ userId, certificationId, patch }) {
  const { data, error } = await supabaseAdmin
    .from('user_certifications')
    .update(patch)
    .eq('id', certificationId)
    .eq('user_id', userId)
    .select(CERT_COLUMNS)
    .maybeSingle()
  if (error) throw asCertError('update', error)
  return data
}

export async function deleteCertification({ userId, certificationId }) {
  const { data, error } = await supabaseAdmin
    .from('user_certifications')
    .delete()
    .eq('id', certificationId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) throw asCertError('delete', error)
  return data || null
}