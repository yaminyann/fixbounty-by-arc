/**
 * The only module that talks to Firebase Auth. Everything else uses AuthContext, so tests can
 * swap this single file (see vite.config.ts, mode "e2e").
 */
import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
}

export const isAuthConfigured = Boolean(config.apiKey && config.authDomain && config.projectId)

let auth: Auth | null = null
if (isAuthConfigured) {
  try {
    auth = getAuth(initializeApp(config as Record<string, string>))
  } catch (err) {
    console.error('[Auth] Firebase failed to initialise:', err)
  }
}

const toUser = (u: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }): AuthUser => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  photoURL: u.photoURL,
})

export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  if (!auth) {
    callback(null)
    return () => undefined
  }
  return onAuthStateChanged(auth, (u) => callback(u ? toUser(u) : null))
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error('not-configured')
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOut(): Promise<void> {
  if (auth) await firebaseSignOut(auth)
}

/** Fresh ID token for the signed-in user (the SDK refreshes it when it is about to expire). */
export async function getIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null
  return auth.currentUser.getIdToken()
}
