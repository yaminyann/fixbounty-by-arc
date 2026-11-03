/**
 * Stand-in for src/lib/authAdapter.ts, used only by `vite --mode e2e` (see vite.config.ts). It signs in as
 * whichever e-mail is stored under localStorage "e2e_identity" and fetches a token from the local harness.
 */
export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export const isAuthConfigured = true

const TOKEN_URL = 'http://127.0.0.1:9911/token'
const listeners = new Set<(user: AuthUser | null) => void>()

function current(): AuthUser | null {
  const email = localStorage.getItem('e2e_identity')
  if (!email) return null
  const local = email.split('@')[0]
  return { uid: `uid-${local}`, email, displayName: local[0].toUpperCase() + local.slice(1), photoURL: null }
}

export function subscribeToAuth(callback: (user: AuthUser | null) => void): () => void {
  listeners.add(callback)
  callback(current())
  return () => listeners.delete(callback)
}

export function signInWithGoogle(): Promise<void> {
  if (!localStorage.getItem('e2e_identity')) localStorage.setItem('e2e_identity', 'alice@test.dev')
  listeners.forEach((l) => l(current()))
  return Promise.resolve()
}

export function signOut(): Promise<void> {
  localStorage.removeItem('e2e_identity')
  listeners.forEach((l) => l(null))
  return Promise.resolve()
}

export async function getIdToken(): Promise<string | null> {
  const user = current()
  if (!user?.email) return null
  const res = await fetch(`${TOKEN_URL}?email=${encodeURIComponent(user.email)}`)
  return res.ok ? res.text() : null
}
