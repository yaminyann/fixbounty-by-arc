// BountyFi GitHub bot. When a maintainer comments "/bounty 200" on an issue, it replies with a link that opens
// BountyFi's "Post a bounty" form already filled in with the issue title, the prize and the issue link.
//
// It never creates a bounty itself: a bounty needs the maintainer's wallet to lock the prize on-chain, so the bot only
// prepares the form. It uses the repository's own GITHUB_TOKEN and needs no BountyFi account or secret.

const BASE = 'https://bountyfi.xyz'
const COMMAND = /^\/bounty\s+(\d{1,9}(?:\.\d{1,6})?)\s*(?:usdc)?\s*(.*)$/im

/** Parses a comment. Returns null when it is not a /bounty command. */
export function parseCommand(body) {
  const match = COMMAND.exec(body ?? '')
  if (!match) return null
  const reward = match[1]
  if (!(Number(reward) > 0)) return null
  const extra = match[2]
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').toLowerCase())
    .filter((t) => /^[a-z0-9][a-z0-9+#._-]{0,23}$/.test(t))
  return { reward, tags: extra.slice(0, 8) }
}

/** Builds the BountyFi link for an issue. Labels become tags; the command's own words add to them. */
export function buildLink({ title, url, reward, labels = [], tags = [], base = BASE }) {
  const all = [...new Set([...labels.map((l) => String(l).toLowerCase()), ...tags])].filter((t) => /^[a-z0-9][a-z0-9+#._-]{0,23}$/.test(t)).slice(0, 8)
  const params = new URLSearchParams({ title: String(title).slice(0, 200), reward, link: url })
  if (all.length > 0) params.set('tags', all.join(', '))
  return `${base}/create?${params.toString()}`
}

export function replyText(link, reward) {
  return [
    `A **${reward} USDC** bounty for this issue is ready to post on BountyFi:`,
    '',
    `[Open the pre-filled form](${link})`,
    '',
    'You will review the text, lock the prize from your own wallet and an admin approves it before it appears. Nothing has been created yet.',
  ].join('\n')
}

/** Only people who can write to the repository may use the command. */
export const MAY_USE = new Set(['admin', 'maintain', 'write'])

async function main() {
  const { readFileSync } = await import('node:fs')
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const command = parseCommand(event.comment?.body)
  if (!command || !event.issue || event.issue.pull_request) return

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const api = (path, init = {}) =>
    fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bountyfi-bot', ...init.headers } })

  const perm = await api(`/repos/${repo}/collaborators/${event.comment.user.login}/permission`)
  const level = perm.ok ? (await perm.json()).permission : 'none'
  if (!MAY_USE.has(level)) {
    console.log(`${event.comment.user.login} cannot use /bounty here (${level}).`)
    return
  }

  const link = buildLink({
    title: event.issue.title,
    url: event.issue.html_url,
    reward: command.reward,
    labels: (event.issue.labels ?? []).map((l) => l.name),
    tags: command.tags,
    base: process.env.BOUNTYFI_URL || BASE,
  })
  const res = await api(`/repos/${repo}/issues/${event.issue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: replyText(link, command.reward) }),
  })
  if (!res.ok) throw new Error(`Could not comment: ${res.status}`)
  console.log('Replied with the BountyFi link.')
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
