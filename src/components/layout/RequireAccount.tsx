import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Callout, Spinner } from '@/components/ui/Feedback'

/** For pages that only need a Google account (no wallet), such as notifications and settings. */
export function RequireAccount({ children, purpose = 'continue' }: { children: ReactNode; purpose?: string }) {
  const { user, loading, signIn } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-mute">
        <Spinner size={18} /> Checking your account
      </div>
    )
  }
  if (!user) {
    return (
      <Callout
        tone="info"
        title={`Sign in with Google to ${purpose}`}
        action={
          <Button variant="primary" onClick={() => void signIn()}>
            Sign in with Google
          </Button>
        }
      />
    )
  }
  return <>{children}</>
}
