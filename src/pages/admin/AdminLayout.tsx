import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Callout, EmptyState, PageHeader, Spinner } from '@/components/ui/Feedback'
import { RouteTabs } from '@/components/ui/Tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminAccess } from '@/lib/api/queries'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/review', label: 'Review queue' },
  { to: '/admin/bounties', label: 'All bounties' },
  { to: '/admin/submissions', label: 'Submissions' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/revenue', label: 'Revenue' },
  { to: '/admin/activity', label: 'Chain activity' },
  { to: '/admin/audit', label: 'Audit log' },
  { to: '/admin/system', label: 'System' },
]

/** Gate for the whole console. Access is decided by the server from your verified Google email. */
export default function AdminLayout() {
  const { user, loading, signIn, signOut } = useAuth()
  const access = useAdminAccess()

  if (loading || (user && access.isPending)) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner size={28} />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg">
        <EmptyState
          title="Sign in to open the admin console"
          action={
            <Button variant="primary" onClick={() => void signIn()}>
              Sign in with Google
            </Button>
          }
        >
          Admin access is tied to your Google account. There is no separate password.
        </EmptyState>
      </div>
    )
  }

  if (access.isError) {
    const forbidden = (access.error as { status?: number }).status === 403
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Callout tone="danger" title={forbidden ? 'This account is not an admin' : 'The console could not be opened'}>
          {forbidden
            ? `${user.email ?? 'This account'} is not on the admin list. Sign in with an admin account.`
            : 'The server did not respond. Try again in a moment.'}
        </Callout>
        <div className="flex gap-2">
          <Button onClick={() => void signOut()}>Sign out</Button>
          {!forbidden && <Button variant="primary" onClick={() => void access.refetch()}>Try again</Button>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Admin console">
        Signed in as {access.data?.email}. Only approved bounties appear on the platform.
      </PageHeader>
      <RouteTabs label="Admin sections" items={TABS} />
      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  )
}
