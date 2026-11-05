import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { errorMessage } from '@/lib/api/client'
import { DisputeBadge, DisputeDialog, REASON_TEXT } from '@/features/bounty/DisputeThread'
import { Segmented } from '@/components/ui/Tabs'
import { useAdminDisputes, type DisputeSummary } from '@/lib/api/collab'
import { useAdminCategories, useAdminProjects, useSaveCategory, useSetProjectStatus, type AdminCategory, type AdminProject } from '@/lib/api/ecosystem'
import { CATEGORY_ICON_NAMES } from '@/lib/nav'
import { formatDate } from '@/lib/time'

const LIMIT = 20

function CategoryDialog({ category, onClose }: { category: AdminCategory | null; onClose: () => void }) {
  const save = useSaveCategory()
  const [form, setForm] = useState({
    slug: category?.slug ?? '',
    name: category?.name ?? '',
    description: category?.description ?? '',
    icon: category?.icon ?? 'code',
    examples: category?.examples.join(', ') ?? '',
    sortOrder: String(category?.sortOrder ?? 100),
  })
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon,
        examples: form.examples
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
        sortOrder: Number(form.sortOrder) || 100,
        active: category?.active ?? true,
      })
      toast.success('Category saved.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'Add a category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            Save category
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value, ...(category ? {} : { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) }) })} />
        </Field>
        <Field label="Identifier" hint="Used in links. It cannot change after the category has bounties.">
          <Input value={form.slug} disabled={Boolean(category)} onChange={(e) => set({ slug: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea rows={2} maxLength={240} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Examples" optional hint="Comma separated, up to 8.">
          <Input value={form.examples} onChange={(e) => set({ examples: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Icon">
            <Select value={form.icon} onChange={(e) => set({ icon: e.target.value })}>
              {CATEGORY_ICON_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order">
            <Input inputMode="numeric" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

export function Categories() {
  const query = useAdminCategories()
  const save = useSaveCategory()
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null)

  const toggle = async (c: AdminCategory) => {
    try {
      await save.mutateAsync({ ...c, active: !c.active })
      toast.success(c.active ? 'Category hidden from the site.' : 'Category is live.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const columns: Column<AdminCategory>[] = [
    {
      header: 'Category',
      cell: (c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-mute">{c.description}</p>
        </div>
      ),
    },
    { header: 'Identifier', cell: (c) => <code className="text-xs">{c.slug}</code> },
    { header: 'Bounties', align: 'right', cell: (c) => <span className="num">{c.bountyCount}</span> },
    { header: 'Status', cell: (c) => (c.active ? <Badge tone="ok">Live</Badge> : <Badge>Hidden</Badge>) },
    {
      header: 'Actions',
      cell: (c) => (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditing(c)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void toggle(c)}>
            {c.active ? 'Hide' : 'Show'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">Categories group bounties for discovery. Hiding one keeps existing bounties but removes it from filters.</p>
        <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
          Add category
        </Button>
      </div>
      <DataTable
        caption="Categories"
        columns={columns}
        rows={query.data}
        rowKey={(c) => c.slug}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No categories"
      />
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export function Projects() {
  const [offset, setOffset] = useState(0)
  const query = useAdminProjects({ limit: LIMIT, offset })
  const setStatus = useSetProjectStatus()

  const toggle = async (p: AdminProject) => {
    try {
      await setStatus.mutateAsync({ slug: p.slug, status: p.status === 'active' ? 'hidden' : 'active' })
      toast.success(p.status === 'active' ? 'Project hidden.' : 'Project is visible again.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const columns: Column<AdminProject>[] = [
    {
      header: 'Project',
      cell: (p) => (
        <Link to={`/projects/${p.slug}`} className="font-medium hover:underline">
          {p.name}
        </Link>
      ),
    },
    { header: 'Owner', cell: (p) => <span className="text-xs text-mute">{p.ownerEmail ?? `${p.ownerWallet.slice(0, 8)}…`}</span> },
    { header: 'Bounties', align: 'right', cell: (p) => <span className="num">{p.bountyCount}</span> },
    { header: 'Created', cell: (p) => <span className="text-xs text-mute">{formatDate(p.createdAt)}</span> },
    { header: 'Status', cell: (p) => (p.status === 'active' ? <Badge tone="ok">Visible</Badge> : <Badge tone="warn">Hidden</Badge>) },
    {
      header: 'Action',
      cell: (p) => (
        <Button size="sm" variant={p.status === 'active' ? 'danger' : 'secondary'} loading={setStatus.isPending} onClick={() => void toggle(p)}>
          {p.status === 'active' ? 'Hide' : 'Show'}
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      caption="Projects"
      columns={columns}
      rows={query.data?.items}
      rowKey={(p) => p.id}
      loading={query.isPending}
      error={query.isError}
      onRetry={() => void query.refetch()}
      dimmed={query.isPlaceholderData}
      emptyTitle="No projects yet"
      page={query.data ? { total: query.data.total, limit: LIMIT, offset, onChange: setOffset } : undefined}
    />
  )
}

export function Disputes() {
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const query = useAdminDisputes(status === 'open' ? 'open' : undefined)

  const columns: Column<DisputeSummary>[] = [
    { header: 'Bounty', cell: (d) => <span className="font-medium">{d.bountyTitle}</span> },
    { header: 'Reason', cell: (d) => <span className="text-xs">{REASON_TEXT[d.reason]}</span> },
    { header: 'Status', cell: (d) => <DisputeBadge status={d.status} /> },
    { header: 'Messages', align: 'right', cell: (d) => <span className="num">{d.commentCount}</span> },
    { header: 'Opened', cell: (d) => <span className="text-xs text-mute">{formatDate(d.createdAt)}</span> },
    {
      header: 'Action',
      cell: (d) => (
        <Button size="sm" variant={d.status === 'open' ? 'primary' : 'secondary'} onClick={() => setOpenId(d.id)}>
          {d.status === 'open' ? 'Mediate' : 'View'}
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Segmented
        label="Dispute filter"
        value={status}
        onChange={setStatus}
        items={[
          { value: 'open', label: 'Open' },
          { value: 'all', label: 'All' },
        ]}
      />
      <DataTable
        caption="Disputes"
        columns={columns}
        rows={query.data}
        rowKey={(d) => d.id}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle={status === 'open' ? 'No open disputes' : 'No disputes yet'}
        emptyHint="Contributors can open one when work is rejected, a prize is reclaimed after they submitted, or a creator has not decided."
      />
      <DisputeDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
