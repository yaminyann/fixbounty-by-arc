import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth, googleProvider, isFirebaseConfigured } from '@/firebase'

const ADMIN_EMAILS = (
  (import.meta as { env?: { VITE_ADMIN_EMAILS?: string } }).env?.VITE_ADMIN_EMAILS ||
  'yaminv75@gmail.com,admin@taskfi.io,admin@fixbounty.io'
)
  .toLowerCase()
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAdmin: boolean
  isConfigured: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(auth !== null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (u) {
        if (u.email && ADMIN_EMAILS.includes(u.email.toLowerCase())) {
          setIsAdmin(true)
        }
        void u
          .getIdToken()
          .then((token) =>
            fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
              .then((res) => (res.ok ? (res.json() as Promise<{ is_admin?: boolean; isAdmin?: boolean } | null>) : null))
              .then((profile) => {
                if (profile?.is_admin === true || profile?.isAdmin === true) {
                  setIsAdmin(true)
                }
              })
          )
          .catch(() => {})
      } else {
        setIsAdmin(false)
      }
    })
    return unsubscribe
  }, [])

  const signInWithGoogle = async () => {
    setError(null)
    if (!auth || !googleProvider) {
      setError(
        'Firebase is not configured. Please supply VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, and VITE_FIREBASE_PROJECT_ID in .env to enable Google Authentication.',
      )
      return
    }
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User dismissed — not an error
        return
      }
      if (code === 'auth/unauthorized-domain') {
        setError(
          'This domain is not authorized in Firebase Console. Add it under Authentication → Settings → Authorized domains.',
        )
        return
      }
      setError('Sign-in failed. Please try again.')
      console.error('[Auth]', err)
    }
  }

  const signOut = async () => {
    if (auth) {
      await firebaseSignOut(auth)
    }
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        isConfigured: isFirebaseConfigured,
        signInWithGoogle,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
