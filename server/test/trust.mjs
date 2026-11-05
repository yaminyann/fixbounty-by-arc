// Checks for the trust and teamwork features: creator record, GitHub PR checks, README badge, encrypted reports,
// saved searches with webhooks, and project member roles. Called by e2e.mjs after the ecosystem checks.
import http from 'node:http'

/** Local stand-ins for GitHub's API and a chat webhook, started before the API so its environment can point at them. */
export async function startFakes() {
  const hooks = []
  const github = http.createServer((req, res) => {
    const m = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(req.url ?? '')
    res.setHeader('content-type', 'application/json')
    if (!m) {
      res.statusCode = 404
      return res.end('{}')
    }
    const n = Number(m[1])
    if (n === 7) return res.end(JSON.stringify({ state: 'closed', merged: true, merged_at: '2026-01-01T00:00:00Z', title: 'Add the export button', user: { login: 'alice-j' } }))
    if (n === 8) return res.end(JSON.stringify({ state: 'open', merged: false, merged_at: null, title: 'Work in progress', user: { login: 'someone-else' } }))
    res.statusCode = 404
    res.end('{}')
  })
  const hook = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      hooks.push(body)
      res.end('ok')
    })
  })
  await new Promise((r) => github.listen(9922, '127.0.0.1', r))
  await new Promise((r) => hook.listen(9923, '127.0.0.1', r))
  return { hooks, close: () => Promise.all([new Promise((r) => github.close(r)), new Promise((r) => hook.close(r))]) }
}

export async function runTrustChecks(ctx, fakes) {
  const { api, tok, accounts, send, board, boardArtifact, usdc, mock, bountyCommitment, submissionCommitment, check, waitFor, db } = ctx
  let r
  const usd = (n) => BigInt(n) * 1_000_000n
  console.log('\nTrust and teamwork')

  const makeBounty = async (who, id, title, listing, reward = usd(40)) => {
    const meta = { title, description: `${title}. Details are in the requirements below so contributors know what to deliver.`, acceptanceCriteria: 'Delivered as described and reviewed by the creator.', tags: ['test'], links: [] }
    await send(who, board, boardArtifact.abi, 'createBounty', [meta.title, bountyCommitment(meta), reward, BigInt(Math.floor(Date.now() / 1000) + 3600), [10000]])
    return { meta, publish: () => api('POST', '/bounties', { auth: tok[who], body: { ...meta, onchainId: id, listing } }),
      fund: async () => {
        await send(who, usdc, mock.abi, 'approve', [board, reward + (reward * 50n) / 10_000n])
        await send(who, board, boardArtifact.abi, 'fundBounty', [BigInt(id)])
        await api('POST', `/bounties/${id}/refresh`)
        return api('POST', `/admin/bounties/${id}/moderation`, { auth: tok.admin, body: { decision: 'approved' } })
      } }
  }
  const submit = async (who, id, description, pullRequestUrl) => {
    const meta = { description, pullRequestUrl, attachments: [] }
    await send(who, board, boardArtifact.abi, 'submitWork', [BigInt(id), submissionCommitment(id, meta)])
    return api('POST', `/bounties/${id}/submissions`, { auth: tok[who], body: meta })
  }

  // ---- 1. creator record ------------------------------------------------------------------------------
  r = await api('GET', `/creators/${accounts.creator.address}`)
  check(
    'creator record counts funded bounties, picked winners and claims',
    r.status === 200 && r.body.funded >= 2 && r.body.pickedWinners >= 2 && r.body.reclaimedAfterSubmissions === 0 && BigInt(r.body.paidToWinners) > 0n && typeof r.body.medianDaysToPickWinners === 'number',
    r.body,
  )
  r = await api('GET', '/creators/not-a-wallet')
  check('creator record rejects a malformed wallet', r.status === 400)
  r = await api('GET', `/creators/${accounts.stranger.address}`)
  check('a wallet with no bounties has an empty record', r.status === 200 && r.body.funded === 0 && r.body.medianDaysToPickWinners === null, r.body)

  // ---- 2. GitHub pull request checks -----------------------------------------------------------------------
  const four = await makeBounty('creator', 4, 'Add an export button to the dashboard', { category: 'development', project: 'acme', skills: ['react'] })
  r = await four.publish()
  check('bounty 4 published', r.status === 201, r.body)
  r = await four.fund()
  check('bounty 4 approved', r.status === 200, r.body)

  r = await submit('alice', 4, 'Adds an export button with CSV download and tests for the empty state.', 'https://github.com/acme/dash/pull/7')
  check('alice submits a merged pull request', r.status === 201, r.body)
  r = await submit('bob', 4, 'Adds an export control. The pull request is still open and needs review from the maintainers.', 'https://github.com/acme/dash/pull/8')
  check('bob submits an open pull request', r.status === 201, r.body)
  r = await submit('carol', 4, 'A write-up of how the export could work, without code. See the linked notes for the plan.', 'https://example.com/notes/export')
  check('carol submits a non-GitHub link', r.status === 201, r.body)

  const prRows = await waitFor(async () => {
    const x = await api('GET', '/bounties/4/submissions', { auth: tok.creator })
    const list = x.body.submissions ?? []
    return list.every((s) => s.prCheckedAt || !/github\.com/.test(s.pullRequestUrl ?? '')) && list.length === 3 ? list : null
  }, 'automatic pull request checks')
  const bySubmitter = (w) => prRows.find((s) => s.submitterWallet === accounts[w].address.toLowerCase())
  check('merged pull request is recorded with its author', bySubmitter('alice').prState === 'merged' && bySubmitter('alice').prMerged === true && bySubmitter('alice').prAuthor === 'alice-j', bySubmitter('alice'))
  check('open pull request is recorded as open', bySubmitter('bob').prState === 'open' && bySubmitter('bob').prMerged === false)
  check('an unchecked non-GitHub link has no check data', bySubmitter('carol').prState === null)
  check('author does not match until the profile names that GitHub handle', bySubmitter('alice').prAuthorMatchesProfile === false)

  await api('POST', '/me/profile', { auth: tok.alice, body: { displayName: 'Alice Dev', githubUrl: 'https://github.com/alice-j' } })
  r = await api('POST', `/submissions/${bySubmitter('alice').id}/check-pr`, { auth: tok.alice })
  check('contributor can re-check their pull request', r.status === 200 && r.body.state === 'merged', r.body)
  r = await api('GET', '/bounties/4/submissions', { auth: tok.creator })
  check('author now matches the profile GitHub link', r.body.submissions.find((s) => s.id === bySubmitter('alice').id).prAuthorMatchesProfile === true)
  r = await api('POST', `/submissions/${bySubmitter('carol').id}/check-pr`, { auth: tok.carol })
  check('non-GitHub links cannot be checked', r.status === 400, r.body)
  r = await api('POST', `/submissions/${bySubmitter('alice').id}/check-pr`, { auth: tok.stranger })
  check('strangers cannot check someone else\'s submission', r.status === 404, r.body)
  r = await api('POST', `/submissions/${bySubmitter('alice').id}/check-pr`)
  check('checking needs a session', r.status === 401)

  // ---- 3. README badge -----------------------------------------------------------------------------------
  const res = await fetch(`${ctx.apiBase}/badge/acme.svg`)
  const svg = await res.text()
  check('badge is an SVG with the open count', res.status === 200 && (res.headers.get('content-type') ?? '').includes('image/svg+xml') && /open/.test(svg) && svg.startsWith('<svg'), svg.slice(0, 120))
  check('badge shows what was paid out', /USDC paid/.test(svg), svg.slice(0, 400))
  const missing = await fetch(`${ctx.apiBase}/badge/no-such-project.svg`)
  check('unknown project gets a grey 404 badge', missing.status === 404 && (await missing.text()).includes('not found'))

  // ---- 4. encrypted reports ------------------------------------------------------------------------------------
  const fakeKey = { kty: 'EC', crv: 'P-256', x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0' }
  r = await api('GET', '/me/encryption-key', { auth: tok.carol })
  check('no encryption key at first', r.status === 200 && r.body.key === null)

  const five = await makeBounty('carol', 5, 'Report weaknesses in the checkout flow', { category: 'security', confidential: true, skills: ['pentest'] })
  r = await five.publish()
  check('encrypted reports need an encryption key first', r.status === 409, r.body)
  r = await api('POST', '/me/encryption-key', { auth: tok.carol, body: { publicJwk: { ...fakeKey, crv: 'P-384' }, wrappedPrivate: 'x'.repeat(60) } })
  check('only P-256 keys are accepted', r.status === 400, r.body)
  r = await api('POST', '/me/encryption-key', { auth: tok.carol, body: { publicJwk: fakeKey, wrappedPrivate: 'wrapped'.repeat(12) } })
  check('carol stores her public key and wrapped private key', r.status === 201, r.body)
  r = await api('POST', '/me/encryption-key', { auth: tok.carol, body: { publicJwk: fakeKey, wrappedPrivate: 'another'.repeat(12) } })
  check('a key cannot be replaced', r.status === 409, r.body)
  r = await api('GET', '/me/encryption-key', { auth: tok.carol })
  check('the owner can read her wrapped key back', r.body.key?.publicJwk?.crv === 'P-256' && r.body.key.wrappedPrivate.length > 40)
  r = await api('GET', '/me/encryption-key', { auth: tok.alice })
  check('other accounts do not see it', r.body.key === null)

  // a saved search that this bounty should trigger (created before approval)
  r = await api('POST', '/me/saved-searches', { auth: tok.bob, body: { name: 'Empty', filters: {} } })
  check('a saved search needs at least one filter', r.status === 400, r.body)
  r = await api('POST', '/me/saved-searches', { auth: tok.bob, body: { name: 'Bad hook', filters: { category: 'security' }, webhookUrl: 'https://evil.example.com/hook' } })
  check('webhooks outside the allowlist are rejected', r.status === 400, r.body)
  r = await api('POST', '/me/saved-searches', { auth: tok.bob, body: { name: 'Security work', filters: { category: 'security' }, webhookUrl: `http://127.0.0.1:9923/hook` } })
  check('bob saves a search with a webhook', r.status === 201, r.body)
  const searchId = r.body.id
  r = await api('POST', '/me/saved-searches', { auth: tok.carol, body: { name: 'My own', filters: { category: 'security' } } })
  check('carol saves a search too (she posts the bounty)', r.status === 201, r.body)
  r = await api('GET', '/me/saved-searches', { auth: tok.bob })
  check('saved searches list never exposes the webhook address', r.body.items.length === 1 && r.body.items[0].hasWebhook === true && !JSON.stringify(r.body).includes('9923'), r.body)

  r = await five.publish()
  check('with a key, the confidential bounty publishes', r.status === 201 && r.body.bounty.confidential === true && r.body.bounty.creatorEncryptionKey?.crv === 'P-256', r.body)
  r = await five.fund()
  check('confidential bounty approved', r.status === 200, r.body)

  const note = await waitFor(async () => {
    const n = await api('GET', '/me/notifications', { auth: tok.bob })
    return n.body.items.find((i) => i.kind === 'saved_search')
  }, 'saved search notification')
  check('matching saved search notifies in-app', note.title.includes('Security work') && note.link === '/bounty/5', note)
  await waitFor(async () => fakes.hooks.length > 0, 'webhook delivery')
  check('matching saved search calls the webhook', fakes.hooks[0].includes('Report weaknesses in the checkout flow'), fakes.hooks[0])
  r = await api('GET', '/me/notifications', { auth: tok.carol })
  check('creators are not alerted about their own bounty', !r.body.items.some((i) => i.kind === 'saved_search'))
  r = await api('GET', '/me/saved-searches', { auth: tok.bob })
  check('delivery is recorded without an error', r.body.items[0].lastTriggeredAt !== null && r.body.items[0].lastError === null, r.body.items[0])

  const plain = { description: 'Plain text vulnerability details that must never be stored in the clear.', pullRequestUrl: 'https://example.com/public', attachments: [] }
  await send('alice', board, boardArtifact.abi, 'submitWork', [5n, submissionCommitment(5, plain)])
  r = await api('POST', '/bounties/5/submissions', { auth: tok.alice, body: plain })
  check('plain text reports are refused on a confidential bounty', r.status === 422, r.body)
  const cipher = { description: `enc:v1:${Buffer.from('not really readable by anyone but the creator').toString('base64')}${'A'.repeat(30)}`, pullRequestUrl: 'https://example.com/public', attachments: [] }
  await send('bob', board, boardArtifact.abi, 'submitWork', [5n, submissionCommitment(5, cipher)])
  r = await api('POST', '/bounties/5/submissions', { auth: tok.bob, body: cipher })
  check('encrypted reports are accepted', r.status === 201, r.body)

  r = await api('GET', '/bounties/5/submissions')
  const anon = r.body.submissions.find((s) => s.submitterWallet === accounts.bob.address.toLowerCase())
  check('the public never receives report ciphertext', anon.description === 'encrypted' && !JSON.stringify(r.body).includes('enc:v1:'), anon)
  r = await api('GET', '/bounties/5/submissions', { auth: tok.carol })
  check('the creator receives the ciphertext to decrypt in the browser', r.body.submissions.find((s) => s.submitterWallet === accounts.bob.address.toLowerCase()).description.startsWith('enc:v1:'))
  r = await api('GET', '/bounties/5/submissions', { auth: tok.bob })
  check('the contributor sees their own submission', r.body.submissions.find((s) => s.submitterWallet === accounts.bob.address.toLowerCase()).description.startsWith('enc:v1:'))
  await waitFor(async () => (await db.query('SELECT submission_count FROM bounties WHERE onchain_id = 5')).rows[0]?.submission_count >= 2, 'bounty 5 submissions to be indexed')
  r = await api('POST', '/bounties/5/listing', { auth: tok.carol, body: { category: 'security', confidential: false } })
  check('encrypted reports cannot be switched off after a submission', r.status === 409, r.body)
  r = await api('DELETE', `/me/saved-searches/${searchId}`, { auth: tok.alice })
  check('saved searches belong to their owner', r.status === 404, r.body)
  r = await api('DELETE', `/me/saved-searches/${searchId}`, { auth: tok.bob })
  check('owner deletes a saved search', r.status === 200, r.body)

  // ---- 5. project members and roles ------------------------------------------------------------------------------
  const sub4 = (w) => bySubmitter(w).id
  r = await api('GET', '/projects/acme/members', { auth: tok.stranger })
  check('non-members cannot list members', r.status === 403, r.body)
  r = await api('POST', '/projects/acme/members', { auth: tok.alice, body: { wallet: accounts.bob.address, role: 'reviewer' } })
  check('contributors cannot add members', r.status === 403, r.body)
  r = await api('POST', '/projects/acme/members', { auth: tok.creator, body: { wallet: accounts.stranger.address, role: 'reviewer' } })
  check('the invited wallet must be linked to an account', r.status === 404, r.body)
  r = await api('POST', '/projects/acme/members', { auth: tok.creator, body: { wallet: accounts.creator.address, role: 'reviewer' } })
  check('the owner cannot be added as a member', r.status === 409, r.body)
  r = await api('POST', '/projects/acme/members', { auth: tok.creator, body: { wallet: accounts.bob.address, role: 'manager' } })
  check('owner appoints bob as manager', r.status === 201, r.body)
  r = await api('POST', '/projects/acme/members', { auth: tok.bob, body: { wallet: accounts.carol.address, role: 'manager' } })
  check('a manager cannot appoint managers', r.status === 403, r.body)
  r = await api('POST', '/projects/acme/members', { auth: tok.bob, body: { wallet: accounts.carol.address, role: 'reviewer' } })
  check('a manager adds carol as a reviewer', r.status === 201, r.body)
  r = await api('GET', '/projects/acme/members', { auth: tok.carol })
  check('members see the list with roles', r.body.yourRole === 'reviewer' && r.body.items.map((m) => m.role).sort().join() === 'manager,owner,reviewer', r.body)
  r = await api('GET', '/me/notifications', { auth: tok.carol })
  check('added members are notified', r.body.items.some((i) => i.kind === 'project_member'))

  r = await api('POST', '/projects/acme', { auth: tok.bob, body: { name: 'Acme Labs', tagline: 'Managed by a manager too', description: 'Edited by bob.' } })
  check('a manager can edit the project', r.status === 200, r.body)
  r = await api('POST', '/projects/acme', { auth: tok.carol, body: { name: 'Nope' } })
  check('a reviewer cannot edit the project', r.status === 403, r.body)

  r = await api('GET', '/bounties/4', { auth: tok.carol })
  check('project reviewers can review bounties of the project', r.body.bounty.viewerCanReview === true)
  r = await api('GET', '/bounties/4', { auth: tok.stranger })
  check('others cannot', r.body.bounty.viewerCanReview === false)
  r = await api('GET', '/me/review-queue', { auth: tok.carol })
  check('the reviewer queue includes project submissions', r.body.items.some((i) => i.onchainId === 4), r.body.items.length)

  r = await api('POST', `/reviews/submission/${sub4('alice')}/decision`, { auth: tok.carol, body: { decision: 'approved', note: 'Merged and tested.' } })
  check('a project reviewer can approve a submission', r.status === 200, r.body)
  r = await api('POST', `/reviews/submission/${sub4('bob')}/decision`, { auth: tok.bob, body: { decision: 'approved', note: 'My own work.' } })
  check('nobody reviews their own submission, even a manager', r.status === 403, r.body)
  r = await api('POST', `/reviews/submission/${sub4('alice')}/comments`, { auth: tok.alice, body: { body: 'Thanks for the quick review.' } })
  check('contributors can still reply', r.status === 201, r.body)
  r = await api('GET', '/me/notifications', { auth: tok.creator })
  check('the creator is notified of submissions', r.body.items.filter((i) => i.kind === 'new_submission').length >= 3)

  r = await api('DELETE', `/projects/acme/members/${(await db.query(`SELECT id FROM users WHERE firebase_uid = 'uid-bob'`)).rows[0].id}`, { auth: tok.alice })
  check('contributors cannot remove members', r.status === 403, r.body)
  const bobId = (await db.query(`SELECT id FROM users WHERE firebase_uid = 'uid-bob'`)).rows[0].id
  const carolId = (await db.query(`SELECT id FROM users WHERE firebase_uid = 'uid-carol'`)).rows[0].id
  r = await api('DELETE', `/projects/acme/members/${bobId}`, { auth: tok.carol })
  check('a reviewer cannot remove a manager', r.status === 403, r.body)
  r = await api('DELETE', `/projects/acme/members/${carolId}`, { auth: tok.bob })
  check('a manager removes a reviewer', r.status === 200, r.body)
  r = await api('POST', `/reviews/submission/${sub4('alice')}/decision`, { auth: tok.carol, body: { decision: 'submitted' } })
  check('removed members lose review rights', r.status === 404, r.body)
  r = await api('DELETE', `/projects/acme/members/${bobId}`, { auth: tok.bob })
  check('members can leave on their own', r.status === 200, r.body)
  r = await api('GET', '/me/projects', { auth: tok.bob })
  check('the project list shows roles', r.body.items.length === 0)
}
