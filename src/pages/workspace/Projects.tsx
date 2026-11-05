import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ExternalLink as ExternalIcon, FolderKanban, Plus } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { ModerationBadge, StatusBadge } from '@/components/bounty/StatusBadge'
import { CADENCE_LABEL, ProjectAvatar } from '@/components/ecosystem/badges'
import { Badge, Callout, EmptyState, ErrorState, PageHeader, Section, Skeleton } from '@/components/ui/Feedback'
import { AddressChip, Avatar, CopyButton } from '@/components/ui/Address'
import { useConfirm } from '@/components/ui/Confirm'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Tabs } from '@/components/ui/Tabs'
import { AnalyticsPanel, IntegrationsPanel } from '@/pages/workspace/ProjectTools'
import { errorMessage } from '@/lib/api/client'
import {
  useCategories,
  useAddMember,
  useCreateProgram,
  useCreateProject,
  useMyProjects,
  useProject,
  useProjectMembers,
  useRemoveMember,
  useRecurringPrograms,
  useUpdateProgram,
  useUpdateProject,
  type Cadence,
  type ProjectMember,
  type RecurringProgram,
} from '@/lib/api/ecosystem'
import { useNow } from '@/hooks/useNow'
import { useMyBounties } from '@/lib/api/queries'
import { formatUsdc, parseUsdc } from '@/lib/money'
import { formatDate } from '@/lib/time'

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

// ---------------------------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------------------------

function ProjectList() {
  const query = useMyProjects(true)
  if (query.isError) return <ErrorState title="Your projects did not load" onRetry={() => void query.refetch()} />
  if (query.isPending) return <Skeleton className="h-32 w-full" />
  if (query.data.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="You have no projects yet"
        action={
          <ButtonLink to="/workspace/projects/new" variant="primary">
            Create a project
          </ButtonLink>
        }
      >
        A project groups your bounties and gives contributors a public page showing what you funded and paid.
      </EmptyState>
    )
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {query.data.map((p) => (
        <li key={p.id}>
          <Link to={p.role === 'reviewer' ? `/projects/${p.slug}` : `/workspace/projects/${p.slug}`} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 hover:bg-ink/[0.02]">
            <span className="flex min-w-0 items-center gap-3">
              <ProjectAvatar name={p.name} logoUrl={p.logoUrl} size={36} />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-display font-semibold">{p.name}</span>
                  {p.status === 'hidden' && <Badge tone="warn">Hidden by an admin</Badge>}
                  {p.role !== 'owner' && <Badge tone="info">{p.role === 'manager' ? 'Manager' : 'Reviewer'}</Badge>}
                </span>
                {p.tagline && <span className="block truncate text-sm text-mute">{p.tagline}</span>}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-mute">
              <span>
                <span className="num font-medium text-ink">{p.openCount}</span> open
              </span>
              <span>
                <span className="num font-medium text-ink">{p.bountyCount}</span> bounties
              </span>
              <span>
                <span className={p.toReview > 0 ? 'num font-medium text-warn' : 'num font-medium text-ink'}>{p.toReview}</span> to review
              </span>
              <span>
                <span className="num font-medium text-ink">{p.programCount}</span> programs
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function MyProjects() {
  return (
    <div>
      <PageHeader
        title="My projects"
        actions={
          <ButtonLink to="/workspace/projects/new" variant="primary" icon={<Plus size={15} aria-hidden />}>
            Create a project
          </ButtonLink>
        }
      >
        Workspaces for the bounties you publish.
      </PageHeader>
      <RequireIdentity purpose="see your projects">
        <ProjectList />
      </RequireIdentity>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Create and edit
// ---------------------------------------------------------------------------------------------

interface ProjectFormValue {
  slug: string
  name: string
  tagline: string
  description: string
  websiteUrl: string
  githubUrl: string
  logoUrl: string
}

function ProjectForm({ initial, onSaved, submitLabel, lockSlug }: { initial: ProjectFormValue; onSaved: (slug: string) => void; submitLabel: string; lockSlug: boolean }) {
  const create = useCreateProject()
  const update = useUpdateProject()
  const [form, setForm] = useState(initial)
  const [slugEdited, setSlugEdited] = useState(lockSlug)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<ProjectFormValue>) => setForm((f) => ({ ...f, ...patch }))
  const pending = create.isPending || update.isPending

  const submit = async () => {
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Give the project a name.'
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(form.slug)) next.slug = 'Use 3 to 40 lowercase letters, numbers or hyphens.'
    for (const key of ['websiteUrl', 'githubUrl', 'logoUrl'] as const) {
      if (form[key] && !/^https?:\/\/\S+$/i.test(form[key])) next[key] = 'Enter a full link starting with https://'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    const { slug, ...rest } = form
    try {
      if (lockSlug) await update.mutateAsync({ slug, ...rest })
      else await create.mutateAsync({ slug, ...rest })
      toast.success(lockSlug ? 'Project saved.' : 'Project created.')
      onSaved(slug)
    } catch (err) {
      const message = errorMessage(err)
      if (/taken/i.test(message)) setErrors({ slug: message })
      else toast.error(message)
    }
  }

  return (
    <form
      className="max-w-2xl space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Project name" error={errors.name}>
        <Input
          value={form.name}
          maxLength={80}
          onChange={(e) => set({ name: e.target.value, ...(slugEdited ? {} : { slug: slugify(e.target.value) }) })}
          placeholder="Acme Labs"
        />
      </Field>
      <Field label="Public address" error={errors.slug} hint={lockSlug ? 'The address cannot change after the project is created.' : `bountyfi.xyz/projects/${form.slug || 'your-project'}`}>
        <Input
          value={form.slug}
          disabled={lockSlug}
          maxLength={40}
          onChange={(e) => {
            setSlugEdited(true)
            set({ slug: e.target.value.toLowerCase() })
          }}
        />
      </Field>
      <Field label="Tagline" optional hint="One line under the name.">
        <Input value={form.tagline} maxLength={160} onChange={(e) => set({ tagline: e.target.value })} />
      </Field>
      <Field label="Overview" optional hint="What the project does and what kind of help you need.">
        <Textarea rows={5} value={form.description} maxLength={5000} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Website" optional error={errors.websiteUrl}>
          <Input type="url" value={form.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder="https://example.com" />
        </Field>
        <Field label="GitHub" optional error={errors.githubUrl}>
          <Input type="url" value={form.githubUrl} onChange={(e) => set({ githubUrl: e.target.value })} placeholder="https://github.com/acme" />
        </Field>
      </div>
      <Field label="Logo link" optional error={errors.logoUrl} hint="A link to a square image. Uploads are not supported yet.">
        <Input type="url" value={form.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="https://example.com/logo.png" />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}

export function NewProject() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="Create a project">A project is the public home of your bounties.</PageHeader>
      <RequireIdentity purpose="create a project">
        <ProjectForm
          lockSlug={false}
          submitLabel="Create project"
          initial={{ slug: '', name: '', tagline: '', description: '', websiteUrl: '', githubUrl: '', logoUrl: '' }}
          onSaved={(slug) => navigate(`/workspace/projects/${slug}`)}
        />
      </RequireIdentity>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Manage
// ---------------------------------------------------------------------------------------------

function ProgramDialog({ slug, program, onClose }: { slug: string; program: RecurringProgram | null; onClose: () => void }) {
  const categories = useCategories()
  const create = useCreateProgram()
  const update = useUpdateProgram()
  const [title, setTitle] = useState(program?.title ?? '')
  const [description, setDescription] = useState(program?.description ?? '')
  const [category, setCategory] = useState(program?.category ?? '')
  const [cadence, setCadence] = useState<Cadence>(program?.cadence ?? 'weekly')
  const [reward, setReward] = useState(program ? formatUsdc(program.rewardPerCycle, 6).replace(/,/g, '') : '')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const amount = parseUsdc(reward)
    if (title.trim().length < 3) return setError('Give the program a title.')
    if (!amount) return setError('Enter the planned reward per cycle in USDC.')
    setError(null)
    const body = { title: title.trim(), description: description.trim(), category: category || null, cadence, rewardPerCycle: amount.toString() }
    try {
      if (program) await update.mutateAsync({ id: program.id, ...body })
      else await create.mutateAsync({ slug, ...body })
      toast.success(program ? 'Program updated.' : 'Program created.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={program ? 'Edit recurring program' : 'New recurring program'}
      description="A plan for regular work. Each cycle becomes a normal bounty that you create and fund."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending || update.isPending} onClick={() => void save()}>
            {program ? 'Save' : 'Create program'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly documentation update" />
        </Field>
        <Field label="What each cycle covers" optional>
          <Textarea rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cadence">
            <Select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
              {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reward per cycle (USDC)">
            <Input inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="50" />
          </Field>
        </div>
        <Field label="Category" optional>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">No category</option>
            {categories.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

function Programs({ slug }: { slug: string }) {
  const query = useRecurringPrograms(slug)
  const update = useUpdateProgram()
  const now = useNow()
  const [dialog, setDialog] = useState<RecurringProgram | 'new' | null>(null)

  const toggle = async (p: RecurringProgram) => {
    try {
      await update.mutateAsync({ id: p.id, active: !p.active })
      toast.success(p.active ? 'Program paused.' : 'Program resumed.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <Callout title="Recurring programs are plans, not automatic payments">
        BountyFi never sends recurring transactions. When a cycle is due, publish it as a normal bounty and fund it from your wallet as usual.
      </Callout>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setDialog('new')}>
          New program
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : query.isError ? (
        <ErrorState title="Programs did not load" onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState title="No recurring programs">Plan weekly documentation, monthly security testing, translation batches or moderation shifts.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {query.data.map((p) => {
            const due = p.nextDue ? new Date(p.nextDue) : null
            const overdue = due !== null && due.getTime() <= now
            const params = new URLSearchParams({ project: slug, program: p.id, title: p.title, reward: formatUsdc(p.rewardPerCycle, 6).replace(/,/g, '') })
            if (p.category) params.set('category', p.category)
            return (
              <li key={p.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-semibold">{p.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge>{CADENCE_LABEL[p.cadence]}</Badge>
                    {!p.active && <Badge tone="warn">Paused</Badge>}
                  </div>
                </div>
                {p.description && <p className="text-sm text-mute">{p.description}</p>}
                <p className="text-xs text-mute">
                  <span className="num font-medium text-ink">{formatUsdc(p.rewardPerCycle)} USDC</span> per cycle · {p.cycleCount} {p.cycleCount === 1 ? 'cycle' : 'cycles'} so far
                  {due && p.active && (
                    <>
                      {' '}
                      · <span className={overdue ? 'font-medium text-warn' : undefined}>{overdue ? 'Due now' : `Next due ${formatDate(due)}`}</span>
                    </>
                  )}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {p.active && (
                    <ButtonLink size="sm" variant={overdue ? 'primary' : 'secondary'} to={`/create?${params.toString()}`}>
                      Publish next cycle
                    </ButtonLink>
                  )}
                  <Button size="sm" onClick={() => setDialog(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" loading={update.isPending} onClick={() => void toggle(p)}>
                    {p.active ? 'Pause' : 'Resume'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {dialog && <ProgramDialog slug={slug} program={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

function ProjectBounties({ slug }: { slug: string }) {
  const query = useMyBounties(true)
  const items = (query.data ?? []).filter((b) => b.projectSlug === slug)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ButtonLink to={`/create?project=${slug}`} variant="primary" size="sm" icon={<Plus size={15} aria-hidden />}>
          Post a bounty for this project
        </ButtonLink>
      </div>
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No bounties in this project yet">Attach a bounty when you post it, or from its listing details.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((b) => (
            <li key={b.id}>
              <Link to={`/bounty/${b.onchainId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.02]">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={b.status} deadline={b.deadline} />
                    <ModerationBadge status={b.moderationStatus} />
                  </span>
                  <span className="mt-1 block truncate font-display font-semibold">{b.title}</span>
                </span>
                <span className="num text-sm font-semibold">{formatUsdc(b.rewardAmount)} USDC</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', reviewer: 'Reviewer' } as const

function MembersPanel({ slug, role }: { slug: string; role: 'owner' | 'manager' }) {
  const members = useProjectMembers(slug, true)
  const add = useAddMember()
  const remove = useRemoveMember()
  const { confirm, dialog } = useConfirm()
  const [wallet, setWallet] = useState('')
  const [memberRole, setMemberRole] = useState<'manager' | 'reviewer'>('reviewer')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet.trim())) return setError('Enter the full wallet address of the person to add.')
    try {
      await add.mutateAsync({ slug, wallet: wallet.trim(), role: memberRole })
      setWallet('')
      toast.success('Member added. They were notified.')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const drop = async (m: ProjectMember) => {
    const ok = await confirm({ title: `Remove ${m.name ?? 'this member'}?`, description: 'They lose access to the project and its reviews immediately.', confirmLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await remove.mutateAsync({ slug, userId: m.userId })
      toast.success('Member removed.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <Callout title="What members can do">
        Managers edit the project and its programs and review submissions. Reviewers only review submissions to the project's bounties. Winners are still picked on-chain by the wallet that created each bounty, so a member cannot move USDC.
      </Callout>

      <form
        className="grid items-end gap-3 sm:grid-cols-[1fr_9rem_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        noValidate
      >
        <Field label="Wallet address" hint="The person must have signed in and linked this wallet.">
          <Input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" />
        </Field>
        <Field label="Role">
          <Select value={memberRole} onChange={(e) => setMemberRole(e.target.value as 'manager' | 'reviewer')}>
            <option value="reviewer">Reviewer</option>
            {role === 'owner' && <option value="manager">Manager</option>}
          </Select>
        </Field>
        <Button type="submit" variant="primary" loading={add.isPending} className="mb-[1.35rem]">
          Add member
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {members.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : members.isError ? (
        <ErrorState title="Members did not load" onRetry={() => void members.refetch()} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {members.data.items.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={m.name ?? m.wallet} src={m.photo} size={30} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name ?? 'No name'}</span>
                  <AddressChip address={m.wallet} />
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={m.role === 'owner' ? 'ink' : m.role === 'manager' ? 'info' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                {m.role !== 'owner' && !(role === 'manager' && m.role === 'manager') && (
                  <Button size="sm" variant="ghost" onClick={() => void drop(m)}>
                    Remove
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  )
}

/** A README badge that always shows the project's live numbers, read from the contract's records. */
function BadgeSnippet({ slug }: { slug: string }) {
  const image = `https://bountyfi.xyz/api/badge/${slug}.svg`
  const markdown = `[![BountyFi](${image})](https://bountyfi.xyz/projects/${slug})`
  return (
    <Section title="README badge" description="Show open bounties and paid-out USDC on your GitHub README.">
      <div className="space-y-3">
        <img src={`/api/badge/${slug}.svg`} alt="BountyFi badge preview" height={20} className="h-5" />
        <div className="flex items-start gap-2 rounded-lg border border-line bg-paper p-3">
          <code className="min-w-0 flex-1 break-all text-xs">{markdown}</code>
          <CopyButton value={markdown} label="Copy badge markdown" />
        </div>
        <p className="text-xs text-mute">The badge refreshes about every five minutes. Hidden projects show "not found".</p>
      </div>
    </Section>
  )
}

type ManageTab = 'bounties' | 'recurring' | 'members' | 'analytics' | 'integrations' | 'details'

export function ManageProject() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<ManageTab>('bounties')
  const query = useProject(slug)

  return (
    <RequireIdentity purpose="manage this project">
      {query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <ErrorState title="The project did not load" onRetry={() => void query.refetch()} />
      ) : query.data.role !== 'owner' && query.data.role !== 'manager' ? (
        <EmptyState title="You cannot manage this project" action={<ButtonLink to={`/projects/${query.data.project.slug}`}>View public page</ButtonLink>} />
      ) : (
        <div className="space-y-6">
          <PageHeader
            title={query.data.project.name}
            actions={
              <ButtonLink to={`/projects/${query.data.project.slug}`} icon={<ExternalIcon size={15} aria-hidden />}>
                Public page
              </ButtonLink>
            }
          >
            {query.data.project.tagline || 'Manage bounties, recurring programs and details.'}
          </PageHeader>
          {query.data.project.status === 'hidden' && (
            <Callout tone="warn" title="This project is hidden by an admin">
              Only you can see it. Contact the team if you think this is a mistake.
            </Callout>
          )}
          <Tabs
            label="Project management"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'bounties', label: 'Bounties' },
              { value: 'recurring', label: 'Recurring programs' },
              { value: 'members', label: 'Members' },
              { value: 'analytics', label: 'Analytics' },
              { value: 'integrations', label: 'Integrations' },
              { value: 'details', label: 'Details' },
            ]}
          />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'bounties' && (
              <Section title="Project bounties">
                <ProjectBounties slug={query.data.project.slug} />
              </Section>
            )}
            {tab === 'recurring' && <Programs slug={query.data.project.slug} />}
            {tab === 'analytics' && <AnalyticsPanel slug={query.data.project.slug} />}
            {tab === 'integrations' && <IntegrationsPanel slug={query.data.project.slug} />}
            {tab === 'members' && <MembersPanel slug={query.data.project.slug} role={query.data.role} />}
            {tab === 'details' && (
              <div className="space-y-10">
              <ProjectForm
                lockSlug
                submitLabel="Save changes"
                initial={{
                  slug: query.data.project.slug,
                  name: query.data.project.name,
                  tagline: query.data.project.tagline,
                  description: query.data.project.description,
                  websiteUrl: query.data.project.websiteUrl ?? '',
                  githubUrl: query.data.project.githubUrl ?? '',
                  logoUrl: query.data.project.logoUrl ?? '',
                }}
                onSaved={() => navigate(`/workspace/projects/${query.data.project.slug}`)}
              />
              <BadgeSnippet slug={query.data.project.slug} />
              </div>
            )}
          </div>
        </div>
      )}
    </RequireIdentity>
  )
}
