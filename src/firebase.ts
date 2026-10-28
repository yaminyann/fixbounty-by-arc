/**
 * Firebase configuration and service exports.
 * Initialize safely; exports auth, db, googleProvider, and isFirebaseConfigured.
 * If credentials are not yet supplied in .env, graceful degradation allows
 * the onchain features and UI to load without crashing the React application.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const rawConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
}

// True if essential configuration values are non-empty and non-placeholder
export const isFirebaseConfigured = Boolean(
  rawConfig.apiKey &&
    !rawConfig.apiKey.includes('your_') &&
    rawConfig.projectId &&
    !rawConfig.projectId.includes('your_') &&
    rawConfig.authDomain &&
    !rawConfig.authDomain.includes('your_'),
)

let appInstance: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null
let googleProviderInstance: GoogleAuthProvider | null = null

if (isFirebaseConfigured) {
  try {
    appInstance = initializeApp(rawConfig as Record<string, string>)
    authInstance = getAuth(appInstance)
    dbInstance = getFirestore(appInstance)
    googleProviderInstance = new GoogleAuthProvider()
  } catch (err) {
    console.error('[FixBounty] Failed to initialize Firebase:', err)
  }
} else if (import.meta.env.DEV) {
  const missing = Object.entries(rawConfig)
    .filter(([, v]) => !v || v.includes('your_'))
    .map(([k]) => k)
  console.warn(
    '[FixBounty] Firebase config missing or unconfigured env vars:',
    missing.join(', '),
    '— Auth and Firestore features will be inactive until you configure .env. Onchain features remain fully functional.',
  )
}

export const app = appInstance
export const auth = authInstance
export const db = dbInstance
export const googleProvider = googleProviderInstance
