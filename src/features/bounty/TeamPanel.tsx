import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { Avatar } from '@/components/ui/Address'
import { Badge, Callout, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { errorMessage } from '@/lib/api/client'
import { useDecideTeamMember, useJoinTeam, useLeaveTeam, useTeam, type TeamMember } from '@/lib/api/ecosystem'
import { Status, type BountyDetail } from '@/lib/api/types'
import { shortAddress } from '@/lib/money'
import { timeAgo } from '@/lib/time'

const pct = (bps: number | null) => (bps === null ? 'Not set' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`)

function AcceptDialog({ bounty, member, onClose }: { bounty: BountyDetail; member: TeamMember; onClose: () => void }) {
  const decide = useDecideTeamMember()
  const [role, setRole] = useState(member.role)
  const [responsibility, setResponsibility] = useState(member.responsibility)
  const [share, setShare] = useState(member.shareBps !== null ? String(member.shareBps / 100) : '')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const value = share.trim() === '' ? null : Number(share)
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) return setError('The share is a percentage between 0 and 100.')
    setError(null)
    try {
      await decide.mutateAsync({ onchainId: bounty.onchainId, memberId: member.id, decision: 'accept', role: role.trim(), responsibility: responsibility.trim(), shareBps: value === null ? null : Math.round(value * 100) })
      toast.success(member.status === 'active' ? 'Team member updated.' : 'Added to the team.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={member.status === 'active' ? 'Edit team member' : 'Add to the team'}
      description={`${member.name ?? shortAddress(member.wallet)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={decide.isPending} onClick={() => void save()}>
            {member.status === 'active' ? 'Save' : 'Add member'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {member.message && <p className="rounded-lg bg-paper px-3 py-2 text-sm">“{member.message}”</p>}
        <Field label="Role" optional>
          <Input value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} placeholder="Frontend lead" />
        </Field>
        <Field label="Responsibility" optional>
          <Textarea rows={3} value={responsibility} maxLength={1000} onChange={(e) => setResponsibility(e.target.value)} />
        </Field>
        <Field label="Agreed share of the prize (%)" optional hint="A record of what the team agreed. The contract pays one wallet, so the team settles the split between themselves.">
          <Input inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} placeholder="40" />
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

function JoinDialog({ bounty, onClose }: { bounty: BountyDetail; onClose: () => void }) {
  const join = useJoinTeam()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    setError(null)
    try {
      await join.mutateAsync({ onchainId: bounty.onchainId, message: message.trim() })
      toast.success('Request sent. The creator was notified.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Ask to join this team"
      description="The creator decides who joins and which part of the work they take."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={join.isPending} onClick={() => void send()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Why you, and what you can take on" optional>
          <Textarea rows={4} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
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

function MemberRow({ m, actions }: { m: TeamMember; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={m.name ?? m.wallet} src={m.photo} size={32} />
        <div className="min-w-0">
          <Link to={`/u/${m.wallet}`} className="font-medium hover:underline">
            {m.name ?? shortAddress(m.wallet)}
          </Link>
          {m.role && <p className="text-sm text-mute">{m.role}</p>}
          {m.responsibility && <p className="prose-plain mt-1 text-sm">{m.responsibility}</p>}
          {m.status === 'requested' && m.message && <p className="mt-1 text-sm text-mute">“{m.message}”</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {m.status === 'active' ? <Badge>{pct(m.shareBps)}</Badge> : <Badge tone="warn">Requested {timeAgo(m.joinedAt)}</Badge>}
        {actions}
      </div>
    </li>
  )
}

export function TeamPanel({ bounty, wallet, isCreator, open }: { bounty: BountyDetail; wallet: string | null; isCreator: boolean; open: boolean }) {
  const query = useTeam(bounty.onchainId)
  const decide = useDecideTeamMember()
  const leave = useLeaveTeam()
  const { confirm, dialog } = useConfirm()
  const [joining, setJoining] = useState(false)
  const [accepting, setAccepting] = useState<TeamMember | null>(null)

  if (query.isPending) return <Skeleton className="h-40 w-full" />
  if (query.isError) return <ErrorState title="The team did not load" onRetry={() => void query.refetch()} />

  const { members, requests, mine, assignedBps, progress } = query.data
  const accepting_new = open && bounty.status === Status.Funded && !isCreator && bounty.workMode === 'team'
  const myPending = requests.find((r) => wallet !== null && r.wallet === wallet && r.status === 'requested')
  const iAmMember = mine?.status === 'active'

  const refuse = async (m: TeamMember, decision: 'decline' | 'remove') => {
    const ok = await confirm({
      title: decision === 'remove' ? 'Remove from the team?' : 'Decline this request?',
      description: `${m.name ?? shortAddress(m.wallet)} will be notified.`,
      confirmLabel: decision === 'remove' ? 'Remove' : 'Decline',
      danger: true,
    })
    if (!ok) return
    try {
      await decide.mutateAsync({ onchainId: bounty.onchainId, memberId: m.id, decision })
      toast.success(decision === 'remove' ? 'Removed from the team.' : 'Request declined.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const onLeave = async () => {
    const ok = await confirm({ title: iAmMember ? 'Leave this team?' : 'Withdraw your request?', confirmLabel: iAmMember ? 'Leave team' : 'Withdraw', danger: true })
    if (!ok) return
    try {
      await leave.mutateAsync({ onchainId: bounty.onchainId })
      toast.success(iAmMember ? 'You left the team.' : 'Request withdrawn.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <Callout tone="info" title="Team splits are agreed off-chain">
        The contract pays each prize place to one wallet. The roles and shares below record what the team agreed between themselves; BountyFi does not split or send USDC for them.
      </Callout>

      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-3">
        <div className="bg-surface px-4 py-3">
          <dt className="text-xs text-mute">Members</dt>
          <dd className="num font-display text-xl font-semibold">{members.length}</dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-xs text-mute">Shares assigned</dt>
          <dd className="num font-display text-xl font-semibold">{pct(assignedBps)}</dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-xs text-mute">Milestones approved</dt>
          <dd className="num font-display text-xl font-semibold">{progress.milestonesTotal === 0 ? 'None set' : `${progress.milestonesApproved} of ${progress.milestonesTotal}`}</dd>
        </div>
      </dl>

      {accepting_new && !myPending && !iAmMember && (
        <RequireIdentity purpose="join this team">
          <Button variant="primary" onClick={() => setJoining(true)}>
            Ask to join the team
          </Button>
        </RequireIdentity>
      )}
      {myPending && (
        <Callout tone="info" title="Your request is waiting for the creator" action={<Button size="sm" onClick={() => void onLeave()}>Withdraw request</Button>} />
      )}
      {iAmMember && (
        <div className="flex items-center gap-3">
          <Badge tone="ok">You are on this team</Badge>
          <Button size="sm" variant="ghost" onClick={() => void onLeave()}>
            Leave team
          </Button>
        </div>
      )}

      <section aria-label="Team members" className="space-y-2">
        <h3 className="font-display text-base font-semibold">Members</h3>
        {members.length === 0 ? (
          <EmptyState title="No members yet">{isCreator ? 'Accept requests below to build the team.' : 'The creator has not accepted anyone yet.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                actions={
                  isCreator && (
                    <>
                      <Button size="sm" onClick={() => setAccepting(m)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void refuse(m, 'remove')}>
                        Remove
                      </Button>
                    </>
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      {requests.length > 0 && (
        <section aria-label="Requests" className="space-y-2">
          <h3 className="font-display text-base font-semibold">{isCreator ? 'Requests to join' : 'Your request'}</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {requests.map((m) => (
              <MemberRow
                key={m.id}
                m={m}
                actions={
                  isCreator && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => setAccepting(m)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void refuse(m, 'decline')}>
                        Decline
                      </Button>
                    </>
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {joining && <JoinDialog bounty={bounty} onClose={() => setJoining(false)} />}
      {accepting && <AcceptDialog bounty={bounty} member={accepting} onClose={() => setAccepting(null)} />}
      {dialog}
    </div>
  )
}
