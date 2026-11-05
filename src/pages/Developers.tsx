import { CopyButton } from '@/components/ui/Address'
import { PageHeader } from '@/components/ui/Feedback'

const BASE = 'https://bountyfi.xyz/api'

const ENDPOINTS: Array<[string, string, string]> = [
  ['GET', '/bounties', 'Approved bounties. Filters: state, category, difficulty, mode, skill, project, minReward, maxReward, deadlineWithin, search, sort, limit, offset'],
  ['GET', '/bounties/:id', 'One bounty by its on-chain id, with prize places, winners and listing details'],
  ['GET', '/bounties/:id/milestones', 'Milestones and their review status'],
  ['GET', '/categories', 'Active categories with counts of open bounties'],
  ['GET', '/projects', 'Project directory'],
  ['GET', '/projects/:slug', 'A project with verified totals'],
  ['GET', '/projects/:slug/{contributors,rewards,activity,recurring}', 'Its public contribution board'],
  ['GET', '/profiles/:wallet', 'A contributor profile and verified achievements'],
  ['GET', '/creators/:wallet', 'A creator record counted from contract events'],
  ['GET', '/leaderboard', 'Contributors by USDC received. Filters: period (30d, 90d), category'],
  ['GET', '/activity', 'Contract events of approved bounties'],
  ['GET', '/stats', 'Platform totals'],
  ['GET', '/config', 'Contract, token, fee wallet, fees and windows'],
  ['GET', '/badge/:slug.svg', 'README badge image for a project'],
]

const EVENTS: Array<[string, string]> = [
  ['bounty_live', 'An admin approved a bounty of the project'],
  ['submission', 'Work was submitted on-chain to one of its bounties'],
  ['winners_picked', 'The creator approved winners'],
  ['reward_claimed', 'A winner claimed a prize, with the amount'],
]

function Code({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-paper p-3">
      <pre className="min-w-0 flex-1 overflow-x-auto text-xs leading-5">
        <code>{children}</code>
      </pre>
      <CopyButton value={children} label="Copy" />
    </div>
  )
}

export default function Developers() {
  return (
    <div className="max-w-4xl space-y-10">
      <PageHeader title="Developers">Read BountyFi data without a key, get webhook events for your project, and put a live badge in your README.</PageHeader>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Public API</h2>
        <p className="max-w-2xl text-mute">
          Everything below is read-only JSON and needs no account or API key. Responses are cached for a few seconds, requests are limited to 600 per minute per IP, and amounts are USDC base units (6 decimals) as strings.
        </p>
        <Code>{`curl "${BASE}/bounties?state=open&category=development&limit=5"`}</Code>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
          {ENDPOINTS.map(([method, path, note]) => (
            <li key={path} className="grid gap-1 px-4 py-3 sm:grid-cols-[4rem_17rem_1fr] sm:gap-4">
              <span className="num font-medium text-mute">{method}</span>
              <code className="break-all text-xs sm:text-sm">{path}</code>
              <span className="text-mute">{note}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-mute">
          Writing needs a signed-in account with a linked wallet and is documented in the repository. Money, winners and status are always read from the contract, so treat the chain as the source of truth.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Project webhooks</h2>
        <p className="max-w-2xl text-mute">
          A project owner or manager can send events to a Discord, Slack or Telegram address from the project's Integrations tab. Other hosts are refused. Each message is one line of text with a link, sent after the event is confirmed on-chain.
        </p>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
          {EVENTS.map(([name, note]) => (
            <li key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <code className="text-xs sm:text-sm">{name}</code>
              <span className="text-mute">{note}</span>
            </li>
          ))}
        </ul>
        <Code>{`POST <your webhook address>
{ "text": "New bounty is live: Build the dashboard (100 USDC) https://bountyfi.xyz/bounty/12", "content": "…same text…" }`}</Code>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">README badge</h2>
        <p className="max-w-2xl text-mute">Shows open bounties and USDC paid for a project. It refreshes about every five minutes.</p>
        <Code>{`[![BountyFi](${BASE}/badge/your-project.svg)](https://bountyfi.xyz/projects/your-project)`}</Code>
      </section>
    </div>
  )
}
