import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

// Firebase configuration is NOT committed with real secrets.
// Set these environment variables to connect CAPACITY CONNECT to a real
// Firebase project (see .env.example). Until then this module stays inert so
// the rest of the app falls back to the isolated development mock store.
//
// NOTE: Firebase Auth is no longer part of the authentication flow (the
// Node.js/Express backend owns authentication through Supabase Auth). This
// module now only initializes Firestore, which still holds user profile / course
// data until the data migration modules land.
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
const appId = import.meta.env.VITE_FIREBASE_APP_ID

const configured = Boolean(apiKey && projectId)

let handle = null

function initFirebase() {
  if (handle) return handle
  if (!configured) return null

  const app = initializeApp({
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.appspot.com`,
    messagingSenderId,
    appId,
  })
  const db = getFirestore(app)

  if (import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true') {
    connectFirestoreEmulator(db, 'localhost', 8080)
  }

  handle = { app, db }
  return handle
}

// True only when real Firebase credentials are present.
export function isFirebaseConfigured() {
  return configured
}

// Returns { app, db } when configured, otherwise null.
export function getFirebase() {
  return initFirebase()
}