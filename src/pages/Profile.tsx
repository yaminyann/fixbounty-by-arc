import { Link, useParams } from 'react-router-dom'
import { Github, Globe } from 'lucide-react'
import { ProjectAvatar } from '@/components/ecosystem/badges'
import { AddressChip, Avatar, TxLink } from '@/components/ui/Address'
import { Badge, EmptyState, ErrorState, Section, Skeleton, SourceBadge, Stat, StatGrid } from '@/components/ui/Feedback'
import { ButtonLink, ExternalLink } from '@/components/ui/Button'
import { useIdentity } from '@/contexts/IdentityContext'
import { ApiError } from '@/lib/api/client'
import { usePublicProfile } from '@/lib/api/ecosystem'
import { formatUsdc, ordinal } from '@/lib/money'
import { formatDate } from '@/lib/time'

export default function Profile() {
  const { wallet } = useParams()
  const query = usePublicProfile(wallet)
  const id = useIdentity()

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (query.isError) {
    if (query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) {
      return (
        <EmptyState title="No public activity for this wallet yet" action={<ButtonLink to="/explore" variant="primary">Explore bounties</ButtonLink>}>
          Profiles appear once a wallet has submitted work, posted a bounty or claimed a prize.
        </EmptyState>
      )
    }
    return <ErrorState title="The profile did not load" onRetry={() => void query.refetch()} />
  }

  const p = query.data
  const mine = id.linkedWallet?.toLowerCase() === p.wallet
  const name = p.profile.name ?? `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}`

  return (
    <article className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={name} src={p.profile.photo} size={64} />
          <div className="min-w-0 space-y-1.5">
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
              <AddressChip address={p.wallet} self={mine} />
              {p.profile.memberSince && <span>Member since {formatDate(p.profile.memberSince)}</span>}
              {p.profile.websiteUrl && (
                <span className="inline-flex items-center gap-1">
                  <Globe size={14} aria-hidden />
                  <ExternalLink href={p.profile.websiteUrl}>{new URL(p.profile.websiteUrl).hostname}</ExternalLink>
                </span>
              )}
              {p.profile.githubUrl && (
                <span className="inline-flex items-center gap-1">
                  <Github size={14} aria-hidden />
                  <ExternalLink href={p.profile.githubUrl}>GitHub</ExternalLink>
                </span>
              )}
            </div>
            {p.profile.bio && <p className="prose-plain max-w-xl pt-1">{p.profile.bio}</p>}
            {p.profile.skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Skills">
                {p.profile.skills.map((s) => (
                  <li key={s}>
                    <Link to={`/explore?skill=${encodeURIComponent(s)}`} className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:border-ink/30">
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!p.linked && <p className="pt-1 text-sm text-mute">This wallet has no BountyFi profile. Only public on-chain activity is shown.</p>}
          </div>
        </div>
        {mine && <ButtonLink to="/settings">Edit profile</ButtonLink>}
      </header>

      <div className="space-y-2">
        <StatGrid>
          <Stat label="Bounties won" value={p.stats.won} hint={`${p.stats.submitted} submitted`} />
          <Stat label="Earned after fees" value={formatUsdc(p.stats.earned, 4)} unit="USDC" hint={<SourceBadge source="chain" />} />
          <Stat label="Milestones approved" value={p.stats.milestonesApproved} hint={<SourceBadge source="platform" />} />
          <Stat label="Bounties posted" value={p.stats.bountiesPosted} />
        </StatGrid>
        <p className="text-xs text-mute">Numbers count approved, public bounties only. Earnings come from claim events on Arc. There are no ratings or scores.</p>
      </div>

      {p.achievements.length > 0 && (
        <Section title="Verified achievements" description="Each one points to its evidence.">
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {p.achievements.map((a) => (
              <li key={a.kind} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-mute">{a.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <SourceBadge source={a.source} />
                  {a.txHash && <TxLink hash={a.txHash} />}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Contribution history">
        {p.contributions.length === 0 ? (
          <p className="text-sm text-mute">No public submissions yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {p.contributions.map((c) => (
              <li key={c.onchainId}>
                <Link to={`/bounty/${c.onchainId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.02]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="text-xs text-mute">
                      {c.projectName ? `${c.projectName} · ` : ''}Submitted {formatDate(c.submittedAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {c.position ? <Badge tone="signal">{ordinal(c.position)} place</Badge> : c.status >= 2 ? <Badge>Not selected</Badge> : <Badge tone="info">In progress</Badge>}
                    {c.position && c.claimed && <Badge tone="ok">Claimed</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {p.milestones.length > 0 && (
        <Section title="Approved milestones" actions={<SourceBadge source="platform" />}>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {p.milestones.map((m) => (
              <li key={m.id}>
                <Link to={`/bounty/${m.onchainId}?tab=milestones`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.02]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.title}</span>
                    <span className="text-xs text-mute">{m.bountyTitle}</span>
                  </span>
                  <span className="text-xs text-mute">Approved {formatDate(m.approvedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.projects.length > 0 && (
        <Section title="Projects">
          <ul className="flex flex-wrap gap-2">
            {p.projects.map((pr) => (
              <li key={pr.slug}>
                <Link to={`/projects/${pr.slug}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pl-1.5 pr-3 text-sm font-medium hover:border-ink/30">
                  <ProjectAvatar name={pr.name} logoUrl={pr.logoUrl} size={24} />
                  {pr.name}
                  <span className="text-xs font-normal text-mute">{pr.role === 'owner' ? 'Owner' : 'Contributor'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.claims.length > 0 && (
        <Section title="Claimed rewards" actions={<SourceBadge source="chain" />}>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {p.claims.map((c) => (
              <li key={c.txHash} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <Link to={`/bounty/${c.onchainId}`} className="block truncate font-medium hover:underline">
                    {c.bountyTitle}
                  </Link>
                  <span className="text-xs text-mute">
                    {ordinal(c.position)} place · {formatDate(c.time)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="num font-semibold">{formatUsdc(c.net, 4)} USDC</span>
                  <TxLink hash={c.txHash} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  )
}
