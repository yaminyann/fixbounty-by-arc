import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { BellPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Form'
import { useAuth } from '@/contexts/AuthContext'
import { errorMessage } from '@/lib/api/client'
import { useCreateSavedSearch, useDeleteSavedSearch, useSavedSearches, type SavedSearch } from '@/lib/api/ecosystem'
import { timeAgo } from '@/lib/time'

type Filters = SavedSearch['filters']

/** One readable line per saved search, for lists and for the default name. */
export function describeFilters(f: Filters): string {
  const parts = [
    f.q && `“${f.q}”`,
    f.category && `category ${f.category}`,
    f.difficulty && f.difficulty,
    f.mode && `${f.mode} work`,
    f.skill && `skill ${f.skill}`,
    f.project && `project ${f.project}`,
    (f.min || f.max) && `${f.min ?? 0} to ${f.max ?? 'any'} USDC`,
  ].filter(Boolean)
  return parts.join(' · ')
}

export const hasAnyFilter = (f: Filters) => Object.values(f).some((v) => v !== undefined && v !== '' && v !== 0)

/** Saves the current Explore filters and alerts the user when a new matching bounty is published. */
export function SaveSearchButton({ filters }: { filters: Filters }) {
  const { user, signIn } = useAuth()
  const create = useCreateSavedSearch()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [webhook, setWebhook] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!hasAnyFilter(filters)) return null

  const start = () => {
    if (!user) return void signIn()
    setName(describeFilters(filters).slice(0, 60))
    setError(null)
    setOpen(true)
  }

  const save = async () => {
    setError(null)
    try {
      await create.mutateAsync({ name: name.trim() || 'My search', filters, webhookUrl: webhook.trim() || undefined })
      toast.success('Saved. You will be alerted when a new bounty matches.')
      setOpen(false)
      setWebhook('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <Button icon={<BellPlus size={15} aria-hidden />} onClick={start}>
        Alert me
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Alert me about new bounties"
        description={describeFilters(filters)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={() => void save()}>
              Save alert
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Chat webhook" optional hint="A Discord, Slack or Telegram webhook address. You always get an in-app notification as well.">
            <Input type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
          </Field>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  )
}

/** The user's saved searches, with delete. Used on the notifications page. */
export function SavedSearchList() {
  const query = useSavedSearches(true)
  const remove = useDeleteSavedSearch()
  const { confirm, dialog } = useConfirm()

  const drop = async (s: SavedSearch) => {
    const ok = await confirm({ title: `Stop alerts for “${s.name}”?`, confirmLabel: 'Delete alert', danger: true })
    if (!ok) return
    try {
      await remove.mutateAsync(s.id)
      toast.success('Alert deleted.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (query.isError) return <ErrorState title="Saved searches did not load" onRetry={() => void query.refetch()} />
  if (query.isPending) return <Skeleton className="h-24 w-full" />
  if (query.data.length === 0) {
    return (
      <EmptyState icon={BellPlus} title="No alerts yet" action={<Link className="text-sm font-medium underline" to="/explore">Open Explore</Link>}>
        Filter bounties on Explore, then press “Alert me” to be told when a new one matches.
      </EmptyState>
    )
  }
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {query.data.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{s.name}</p>
              <p className="text-sm text-mute">{describeFilters(s.filters)}</p>
              <p className="text-xs text-mute">
                {s.hasWebhook ? 'Chat webhook on · ' : ''}
                {s.lastTriggeredAt ? `Last alert ${timeAgo(s.lastTriggeredAt)}` : 'No match yet'}
                {s.lastError ? ` · ${s.lastError}` : ''}
              </p>
            </div>
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={() => void drop(s)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
      {dialog}
    </>
  )
}
