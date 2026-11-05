import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/Feedback'
import { RequireAccount } from '@/components/layout/RequireAccount'
import { SavedSearchList } from '@/components/ecosystem/SaveSearch'
import { Tabs } from '@/components/ui/Tabs'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useMarkRead, useNotifications, type AppNotification } from '@/lib/api/ecosystem'
import { errorMessage } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/time'

function Content() {
  const query = useNotifications(true)
  const mark = useMarkRead()
  const navigate = useNavigate()

  const open = (n: AppNotification) => {
    if (!n.readAt) mark.mutate({ ids: [n.id] })
    if (n.link) navigate(n.link)
  }

  const markAll = async () => {
    try {
      await mark.mutateAsync({ all: true })
      toast.success('All caught up.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (query.isError) return <ErrorState title="Notifications did not load" onRetry={() => void query.refetch()} />
  if (query.isPending) return <Skeleton className="h-40 w-full" />
  const { items, unread } = query.data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-mute">{unread > 0 ? `${unread} unread` : 'You are all caught up'}</p>
        <Button size="sm" icon={<CheckCheck size={15} aria-hidden />} disabled={unread === 0} loading={mark.isPending} onClick={() => void markAll()}>
          Mark all as read
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet">Reviews, team requests, approvals and wins show up here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={cn('flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-ink/[0.02]', !n.readAt && 'bg-signal-soft/40')}>
                <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-signal-deep')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-mute">{n.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-mute">{timeAgo(n.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Notifications() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'inbox' | 'alerts'>('inbox')
  return (
    <div>
      <PageHeader title="Notifications">What happened on your bounties, submissions and teams, and alerts for new bounties.</PageHeader>
      <RequireAccount purpose="see your notifications">
        {user && (
          <div className="space-y-6">
            <Tabs
              label="Notification sections"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'inbox', label: 'Inbox' },
                { value: 'alerts', label: 'Saved searches' },
              ]}
            />
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'inbox' ? <Content /> : <SavedSearchList />}
            </div>
          </div>
        )}
      </RequireAccount>
    </div>
  )
}
