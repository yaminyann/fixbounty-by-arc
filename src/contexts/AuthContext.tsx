import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isAuthConfigured, signInWithGoogle, signOut as adapterSignOut, subscribeToAuth, type AuthUser } from '@/lib/authAdapter'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  configured: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(isAuthConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      subscribeToAuth((next) => {
        setUser(next)
        setLoading(false)
      }),
    [],
  )

  const signIn = useCallback(async () => {
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      if ((err as Error).message === 'not-configured') {
        setError('Google sign-in is not configured for this deployment.')
      } else if (code === 'auth/unauthorized-domain') {
        setError('This domain is not authorised for Google sign-in. Add it under Firebase Authentication, Settings, Authorized domains.')
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.')
      } else {
        setError('Google sign-in failed. Try again.')
        console.error('[Auth]', err)
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    await adapterSignOut()
    setUser(null)
    queryClient.removeQueries({ queryKey: ['me'] })
    queryClient.removeQueries({ queryKey: ['mine'] })
    queryClient.removeQueries({ queryKey: ['admin'] })
  }, [queryClient])

  const value = useMemo(
    () => ({ user, loading, configured: isAuthConfigured, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
