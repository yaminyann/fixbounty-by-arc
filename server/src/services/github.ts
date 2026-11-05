import { query } from '../db.js'

/**
 * Reads a pull request from GitHub's public API and stores what it says. Only github.com/<owner>/<repo>/pull/<n>
 * links are fetched, so a submission can never make the server call an arbitrary address. The API base can be
 * overridden for tests with GITHUB_API_URL.
 */

const PR_URL = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})\/pull\/(\d{1,9})(?:[/?#].*)?$/

export function parsePullRequestUrl(url: string): { owner: string; repo: string; number: number } | null {
  const match = PR_URL.exec(url.trim())
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null
}

export interface PullRequestCheck {
  state: 'open' | 'closed' | 'merged' | 'not_found'
  merged: boolean
  author: string | null
  title: string | null
}

export class GithubUnavailable extends Error {}

export async function fetchPullRequest(url: string): Promise<PullRequestCheck> {
  const pr = parsePullRequestUrl(url)
  if (!pr) throw new Error('Not a GitHub pull request link')
  const base = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '')
  let res: Response
  try {
    res = await fetch(`${base}/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BountyFi-pr-check', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(6_000),
    })
  } catch {
    throw new GithubUnavailable('GitHub could not be reached. Try again in a moment.')
  }
  if (res.status === 404) return { state: 'not_found', merged: false, author: null, title: null }
  if (res.status === 403 || res.status === 429) throw new GithubUnavailable('GitHub is rate limiting checks right now. Try again later.')
  if (!res.ok) throw new GithubUnavailable(`GitHub answered ${res.status}.`)

  const body = (await res.json()) as { state?: string; merged?: boolean; merged_at?: string | null; title?: string; user?: { login?: string } }
  const merged = body.merged === true || Boolean(body.merged_at)
  return {
    state: merged ? 'merged' : body.state === 'closed' ? 'closed' : 'open',
    merged,
    author: body.user?.login?.slice(0, 80) ?? null,
    title: body.title?.slice(0, 300) ?? null,
  }
}

/** Checks the pull request of a stored submission and saves the result. Returns null when the link is not a GitHub PR. */
export async function checkSubmissionPr(submissionId: string, url: string | null): Promise<PullRequestCheck | null> {
  if (!url || !parsePullRequestUrl(url)) return null
  const result = await fetchPullRequest(url)
  await query(
    `UPDATE submissions SET pr_state = $2, pr_merged = $3, pr_author = $4, pr_title = $5, pr_checked_at = NOW() WHERE id = $1`,
    [submissionId, result.state, result.merged, result.author, result.title],
  )
  return result
}
