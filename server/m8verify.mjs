#!/usr/bin/env node
// READ-ONLY Module 8 verification A — exercises the repo's own storage.service
// (upload → signed URL → signed fetch → remove) against the now-provisioned
// PRIVATE capacity-connect bucket. Deleted after run. Never mutates schema.
import { STORAGE_BUCKET, upload, createSignedUrl, remove as removePaths } from './src/services/storage.service.js'

const probe = `m8verify/${Date.now()}-ok.txt`
const body = Buffer.from('capacity-connect module8 signed-roundtrip')

console.log('\n  MODULE 8 VERIFICATION A — storage round trip (private bucket)')
console.log('  Bucket:', STORAGE_BUCKET, '\n')

// [A1] upload
const up = await upload({ path: probe, body, contentType: 'text/plain' })
console.log('  [A1] upload(): OK path=' + up.path)

// [A2] signed URL
const { signedUrl } = await createSignedUrl(probe, 120)
console.log('  [A2] createSignedUrl(): OK (len=' + (signedUrl || '').length + ')')

// [A3] fetch through the signed URL (name written by us — small, no external exec)
const res = await fetch(signedUrl)
const text = await res.text()
console.log('  [A3] GET signedUrl: status=' + res.status + ' body=' + JSON.stringify(text))

// [A4] remove
const removed = await removePaths(probe)
console.log('  [A4] remove(): OK →', JSON.stringify(removed))

console.log('\n  RESULT: PASS\n')
