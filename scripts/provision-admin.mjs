#!/usr/bin/env node
// ---------------------------------------------------------------------------
// PROVISION ADMIN — one-time setup script for CAPACITY CONNECT
// ---------------------------------------------------------------------------
//
// Creates the first ADMIN account in Firebase Auth + Firestore.
// Uses the Firebase Admin SDK with a service account credential.
//
// PREREQUISITES:
//   1. Go to Firebase Console → Project Settings → Service accounts
//   2. Click "Generate new private key" → save as serviceAccount.json
//   3. Place serviceAccount.json in the project root (it is git-ignored)
//
// USAGE:
//   node scripts/provision-admin.mjs
//   node scripts/provision-admin.mjs --email admin@capacity.gov.in --password 'YourSecurePassword'
//   node scripts/provision-admin.mjs --uid <existing-firebase-auth-uid>
//
// The script will:
//   A. Create a Firebase Auth account (or use an existing UID)
//   B. Create the Firestore users/{uid} document with role=ADMIN, approvalStatus=APPROVED
//   C. Print the UID for reference
//
// SECURITY:
//   - serviceAccount.json must NEVER be committed to version control
//   - This script is for initial setup only — not for production use
//   - Admin accounts should only be created through this script or Firebase Console
// ---------------------------------------------------------------------------

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const EMAIL = getArg('email', 'admin@capacity.gov.in')
const PASSWORD = getArg('password', 'Admin@Capacity2026!')
const uidOverride = getArg('uid', null)
const ROLE = 'ADMIN'

// ---------------------------------------------------------------------------
// Load service account
// ---------------------------------------------------------------------------
const saPath = resolve(ROOT, 'serviceAccount.json')
if (!existsSync(saPath)) {
  console.error('\n  ERROR: serviceAccount.json not found in project root.\n')
  console.error('  Steps to obtain it:')
  console.error('    1. Go to Firebase Console → Project Settings → Service accounts')
  console.error('    2. Click "Generate new private key"')
  console.error('    3. Save the file as serviceAccount.json in the project root\n')
  process.exit(1)
}

let serviceAccount
try {
  serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'))
} catch (err) {
  console.error('  ERROR: Failed to parse serviceAccount.json:', err.message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Initialize Firebase Admin
// ---------------------------------------------------------------------------
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  })
}

const auth = getAuth()
const db = getFirestore()

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n  CAPACITY CONNECT — Admin Provisioning')
  console.log('  ======================================\n')
  console.log(`  Project:  ${serviceAccount.project_id}`)
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Role:     ${ROLE}`)
  console.log()

  let uid = uidOverride

  // Step 1: Create or locate Firebase Auth account
  if (uid) {
    console.log(`  Using existing UID: ${uid}`)
    try {
      const user = await auth.getUser(uid)
      console.log(`  Auth account found: ${user.email || '(no email)'}\n`)
    } catch {
      console.error(`  ERROR: No Firebase Auth user found with UID "${uid}".`)
      console.error('  Create the user in Firebase Console → Authentication → Users first.\n')
      process.exit(1)
    }
  } else {
    // Check if email already exists
    let existingUser
    try {
      existingUser = await auth.getUserByEmail(EMAIL)
    } catch {
      // User does not exist — that's expected
    }

    if (existingUser) {
      uid = existingUser.uid
      console.log(`  Firebase Auth account already exists for ${EMAIL}`)
      console.log(`  UID: ${uid}\n`)
    } else {
      console.log('  Creating Firebase Auth account...')
      const userRecord = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: 'Platform Administrator',
        emailVerified: true,
      })
      uid = userRecord.uid
      console.log(`  Created! UID: ${uid}\n`)
    }
  }

  // Step 2: Create Firestore users/{uid} document
  const userDoc = db.collection('users').doc(uid)
  const snap = await userDoc.get()

  if (snap.exists) {
    const data = snap.data()
    console.log('  Firestore profile already exists.')
    if (data.role === ROLE && data.approvalStatus === 'APPROVED') {
      console.log('  role = ADMIN, approvalStatus = APPROVED — no changes needed.\n')
    } else {
      console.log(`  Updating role (${data.role} → ${ROLE}) and approvalStatus (${data.approvalStatus} → APPROVED)...`)
      await userDoc.update({
        role: ROLE,
        approvalStatus: 'APPROVED',
        updatedAt: new Date().toISOString(),
      })
      console.log('  Updated.\n')
    }
  } else {
    console.log('  Creating Firestore users/' + uid + ' document...')
    await userDoc.set({
      uid,
      fullName: 'Platform Administrator',
      email: EMAIL,
      role: ROLE,
      approvalStatus: 'APPROVED',
      station: 'New Delhi',
      region: 'North',
      organization: 'India Meteorological Department',
      department: 'IMD Headquarters',
      empId: 'IMD-HQ-0001',
      title: 'Director, Capacity Building',
      expertise: [],
      specializations: [],
      skills: [],
      qualifications: [],
      professionalSummary: '',
      yearsOfExperience: '',
      trainingInterests: [],
      achievements: [],
      certifications: [],
      photoURL: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profileCompletion: 0,
    })
    console.log('  Created.\n')
  }

  // Step 3: Summary
  console.log('  ─────────────────────────────────────')
  console.log('  ADMIN ACCOUNT READY')
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  UID:      ${uid}`)
  console.log('  Role:     ADMIN')
  console.log('  Status:   APPROVED')
  console.log('  ─────────────────────────────────────\n')
  console.log('  You can now log in at /auth with these credentials.\n')
}

main().catch((err) => {
  console.error('  FATAL:', err.message || err)
  process.exit(1)
})
