// End-to-end check of the backend against a local chain and a throwaway Postgres.
//
//   anvil --port 8545 --block-time 1
//   docker run -d --name fb-test-pg -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=fixbounty -p 55432:5432 postgres:16-alpine
//   forge build && bun run abi
//   node node_modules/typescript/bin/tsc -p server && cp -r server/src/migrations server/dist/
//   node server/test/e2e.mjs
//
// Uses anvil's well-known public test keys; never run it against a real network.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { runEcosystemChecks } from './ecosystem.mjs'
import { runTrustChecks, startFakes } from './trust.mjs'
import { runInsightChecks } from './insights.mjs'
import { createPublicClient, createWalletClient, http as viemHttp, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const RPC = process.env.E2E_RPC ?? 'http://127.0.0.1:8545'
const PG_ADMIN = process.env.E2E_PG ?? 'postgresql://postgres:testpass@127.0.0.1:55432/postgres'
const DB_NAME = 'fixbounty_e2e'
const API_PORT = 4100
const JWKS_PORT = 9911
const API = `http://127.0.0.1:${API_PORT}/api`
const PROJECT = 'e2e-project'
const TREASURY = '0x378862A20B312298dc54585CbabC531D70F9baE9'

const KEYS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  creator: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  alice: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  bob: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  carol: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  stranger: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
}
const accounts = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, privateKeyToAccount(v)]))

const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const publicClient = createPublicClient({ chain, transport: viemHttp(RPC) })
const wallet = (who) => createWalletClient({ account: accounts[who], chain, transport: viemHttp(RPC) })

let failures = 0
function check(name, ok, extra) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}`, extra ?? '')
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, label, timeoutMs = 20_000) {
  const start = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {
      // keep polling
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`)
    await sleep(400)
  }
}

// --- local JWKS + token signer ------------------------------------------------
const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' }
const jwksServer = http.createServer((_req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ keys: [jwk] }))
})
await new Promise((r) => jwksServer.listen(JWKS_PORT, '127.0.0.1', r))

async function token(uid, email, emailVerified = true) {
  return new SignJWT({ email, email_verified: emailVerified, name: uid })
    .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
    .setSubject(uid)
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function api(method, route, { body, auth } = {}) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, body: json }
}

// --- database ---------------------------------------------------------------------
const admin = new pg.Client({ connectionString: PG_ADMIN })
await admin.connect()
await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`)
await admin.query(`CREATE DATABASE ${DB_NAME}`)
await admin.end()
const DATABASE_URL = PG_ADMIN.replace(/\/[^/]*$/, `/${DB_NAME}`)
const db = new pg.Client({ connectionString: DATABASE_URL })
await db.connect()

// --- contracts ------------------------------------------------------------------------
const artifact = (file, name) => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', file, `${name}.json`), 'utf8'))
const mock = artifact('MockERC20.sol', 'MockERC20')
const boardArtifact = artifact('BountyBoard.sol', 'BountyBoard')

const deployer = wallet('deployer')
const usdcHash = await deployer.deployContract({ abi: mock.abi, bytecode: mock.bytecode.object, args: ['Mock USDC', 'mUSDC', 6] })
const usdc = (await publicClient.waitForTransactionReceipt({ hash: usdcHash })).contractAddress
const boardHash = await deployer.deployContract({ abi: boardArtifact.abi, bytecode: boardArtifact.bytecode.object, args: [usdc, TREASURY] })
const boardReceipt = await publicClient.waitForTransactionReceipt({ hash: boardHash })
const board = boardReceipt.contractAddress
console.log(`USDC ${usdc}\nBountyBoard ${board} (block ${boardReceipt.blockNumber})`)

const { bountyCommitment, submissionCommitment } = await import(pathToFileURL(path.join(root, 'server/dist/lib/metadata.js')).href)

const send = async (who, address, abi, functionName, args = []) => {
  const hash = await wallet(who).writeContract({ address, abi, functionName, args })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted`)
  return receipt
}
const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args })
const balanceOf = (who) => read(usdc, mock.abi, 'balanceOf', [who])

for (const who of ['creator', 'alice', 'bob', 'carol']) {
  await send('deployer', usdc, mock.abi, 'mint', [accounts[who].address, 100_000_000_000n])
}

// --- start the server -----------------------------------------------------------------
const fakes = await startFakes()
const server = spawn('node', ['server/dist/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(API_PORT),
    DATABASE_URL,
    FIREBASE_PROJECT_ID: PROJECT,
    FIREBASE_JWKS_URL: `http://127.0.0.1:${JWKS_PORT}/jwks.json`,
    ADMIN_EMAILS: 'admin@test.dev',
    ARC_RPC_URL: RPC,
    CHAIN_ID: '31337',
    BOUNTY_BOARD_ADDRESS: board,
    USDC_ADDRESS: usdc,
    TREASURY_ADDRESS: TREASURY,
    INDEXER_START_BLOCK: String(boardReceipt.blockNumber),
    INDEXER_POLL_MS: '700',
    GITHUB_API_URL: 'http://127.0.0.1:9922',
    ALERT_WEBHOOK_HOSTS: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))

async function shutdown(code) {
  server.kill()
  jwksServer.close()
  await fakes.close().catch(() => undefined)
  await db.end().catch(() => undefined)
  process.exit(code)
}

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${API_PORT}/api/health`)).ok, 'server health', 30_000)
  console.log('\nServer is up\n')

  const tok = {
    creator: await token('uid-creator', 'creator@test.dev'),
    alice: await token('uid-alice', 'alice@test.dev'),
    bob: await token('uid-bob', 'bob@test.dev'),
    carol: await token('uid-carol', 'carol@test.dev'),
    stranger: await token('uid-stranger', 'stranger@test.dev'),
    admin: await token('uid-admin', 'admin@test.dev'),
    fakeAdmin: await token('uid-fake', 'admin@test.dev', false),
  }

  // ---- 1. auth and wallet linking --------------------------------------------------
  console.log('Auth and wallet linking')
  let r = await api('GET', '/auth/me')
  check('anonymous /auth/me is 401', r.status === 401)

  r = await api('GET', '/auth/me', { auth: 'not-a-jwt' })
  check('garbage token is 401', r.status === 401)

  const linkWallet = async (who) => {
    const ch = await api('POST', '/auth/wallet/challenge', { auth: tok[who], body: { address: accounts[who].address } })
    if (ch.status !== 200) return ch
    const signature = await accounts[who].signMessage({ message: ch.body.message })
    return api('POST', '/auth/wallet/link', { auth: tok[who], body: { address: accounts[who].address, signature } })
  }
  for (const who of ['creator', 'alice', 'bob', 'carol']) {
    r = await linkWallet(who)
    check(`${who} links wallet`, r.status === 200, r.body)
  }

  r = await api('GET', '/auth/me', { auth: tok.creator })
  check('/auth/me returns linked wallet', r.body?.wallet === accounts.creator.address.toLowerCase())

  // Another account cannot claim a wallet that is already linked.
  const ch = await api('POST', '/auth/wallet/challenge', { auth: tok.stranger, body: { address: accounts.alice.address } })
  const forged = await accounts.alice.signMessage({ message: ch.body.message })
  r = await api('POST', '/auth/wallet/link', { auth: tok.stranger, body: { address: accounts.alice.address, signature: forged } })
  check('wallet already linked to another account is rejected', r.status === 409, r.body)

  // A signature from a different key is rejected.
  const ch2 = await api('POST', '/auth/wallet/challenge', { auth: tok.stranger, body: { address: accounts.stranger.address } })
  const wrongSig = await accounts.bob.signMessage({ message: ch2.body.message })
  r = await api('POST', '/auth/wallet/link', { auth: tok.stranger, body: { address: accounts.stranger.address, signature: wrongSig } })
  check('signature from another key is rejected', r.status === 401, r.body)

  r = await api('GET', '/me/bounties', { auth: tok.stranger })
  check('write/me endpoints need a linked wallet', r.status === 403, r.body)

  // ---- 2. create a podium bounty ---------------------------------------------------
  console.log('\nBounty lifecycle')
  const meta = {
    title: 'Fix dark mode flicker',
    description: 'The page flashes white on reload when dark mode is on. Inject the theme script before paint.',
    acceptanceCriteria: 'No flash on reload and respects prefers-color-scheme.',
    tags: ['react', 'css'],
    links: ['https://github.com/example/repo/issues/42'],
  }
  const reward = 200_000_000n // 200 USDC
  const shares = [5000, 3000, 2000]
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

  let receipt = await send('creator', board, boardArtifact.abi, 'createBounty', [meta.title, bountyCommitment(meta), reward, deadline, shares])
  const onchainId = 1
  check('createBounty mined', receipt.status === 'success')

  // wrong wallet cannot publish metadata
  r = await api('POST', '/bounties', { auth: tok.alice, body: { ...meta, onchainId } })
  check('non-creator cannot publish metadata', r.status === 403, r.body)

  // tampered description is rejected
  r = await api('POST', '/bounties', { auth: tok.creator, body: { ...meta, description: meta.description + ' (edited)', onchainId } })
  check('description not matching on-chain hash is rejected', r.status === 422, r.body)

  r = await api('POST', '/bounties', { auth: tok.creator, body: { ...meta, onchainId } })
  check('creator publishes metadata', r.status === 201 && r.body.bounty.moderationStatus === 'pending', r.body)

  r = await api('POST', '/bounties', { auth: tok.alice, body: { ...meta, onchainId } })
  check('a second account cannot overwrite published metadata', r.status === 403 || r.status === 409, r.body)

  r = await api('GET', '/bounties')
  check('pending bounty is NOT in the public list', r.status === 200 && r.body.total === 0, r.body)
  r = await api('GET', `/bounties/${onchainId}`)
  check('pending bounty is 404 for anonymous visitors', r.status === 404)
  r = await api('GET', `/bounties/${onchainId}`, { auth: tok.creator })
  check('creator can see their pending bounty', r.status === 200 && r.body.bounty.moderationStatus === 'pending')

  // ---- 3. admin moderation -----------------------------------------------------
  r = await api('GET', '/admin/overview', { auth: tok.creator })
  check('non-admin gets 403 on admin API', r.status === 403)
  r = await api('GET', '/admin/overview', { auth: tok.fakeAdmin })
  check('unverified email cannot be admin', r.status === 403)
  r = await api('GET', '/admin/overview')
  check('anonymous gets 401 on admin API', r.status === 401)
  r = await api('POST', `/admin/bounties/${onchainId}/moderation`, { auth: tok.admin, body: { decision: 'approved' } })
  check('admin cannot approve an unfunded bounty', r.status === 409, r.body)

  // fund: needs reward + 0.5% fee
  const fee = (reward * 50n) / 10_000n
  await send('creator', usdc, mock.abi, 'approve', [board, reward + fee])
  const treasuryBefore = await balanceOf(TREASURY)
  await send('creator', board, boardArtifact.abi, 'fundBounty', [BigInt(onchainId)])
  check('post fee 0.5% reached the treasury', (await balanceOf(TREASURY)) - treasuryBefore === fee)

  r = await api('POST', `/bounties/${onchainId}/refresh`)
  check('refresh syncs funded status', r.status === 200 && r.body.status === 1, r.body)

  r = await api('GET', '/admin/bounties?moderation=pending', { auth: tok.admin })
  check('moderation queue lists the bounty with creator email', r.status === 200 && r.body.total === 1 && r.body.items[0].creatorEmail === 'creator@test.dev', r.body)

  r = await api('POST', `/admin/bounties/${onchainId}/moderation`, { auth: tok.admin, body: { decision: 'rejected' } })
  check('rejecting needs a reason', r.status === 400)

  r = await api('POST', `/admin/bounties/${onchainId}/moderation`, { auth: tok.admin, body: { decision: 'approved' } })
  check('admin approves funded bounty', r.status === 200, r.body)

  r = await api('GET', '/bounties')
  check('approved bounty is now public', r.body.total === 1 && r.body.items[0].onchainId === onchainId, r.body)
  check('list exposes prize shares and slots', JSON.stringify(r.body.items[0].prizeShares) === JSON.stringify(shares) && r.body.items[0].winnerSlots === 3)

  r = await api('GET', '/bounties?search=flicker')
  check('search by title finds it', r.body.total === 1)
  r = await api('GET', '/bounties?search=react')
  check('search by tag finds it', r.body.total === 1)
  r = await api('GET', '/bounties?search=nothingmatches')
  check('search miss returns none', r.body.total === 0)
  r = await api('GET', '/bounties/abc')
  check('malformed id is a clean 400, not a crash', r.status === 400)
  r = await api('GET', '/bounties/99999999999')
  check('oversized id is a clean 400', r.status === 400)

  // ---- 4. submissions -----------------------------------------------------------------
  const subMeta = (who) => ({
    description: `Fix from ${who}: injects the theme script into the document head before first paint.`,
    pullRequestUrl: `https://github.com/example/repo/pull/${who.length}`,
    attachments: [],
  })
  for (const who of ['alice', 'bob', 'carol']) {
    await send(who, board, boardArtifact.abi, 'submitWork', [BigInt(onchainId), submissionCommitment(onchainId, subMeta(who))])
  }

  r = await api('POST', `/bounties/${onchainId}/submissions`, { auth: tok.alice, body: { ...subMeta('alice'), description: 'A different text that was never committed on-chain.' } })
  check('notes not matching the on-chain hash are rejected', r.status === 422, r.body)

  for (const who of ['alice', 'bob', 'carol']) {
    r = await api('POST', `/bounties/${onchainId}/submissions`, { auth: tok[who], body: subMeta(who) })
    check(`${who} attaches notes`, r.status === 201, r.body)
  }
  r = await api('POST', `/bounties/${onchainId}/submissions`, { auth: tok.alice, body: subMeta('alice') })
  check('notes are immutable once attached', r.status === 409, r.body)
  r = await api('POST', `/bounties/${onchainId}/submissions`, { auth: tok.creator, body: subMeta('alice') })
  check('creator cannot submit', r.status === 403, r.body)

  r = await api('GET', `/bounties/${onchainId}/submissions`)
  check('three submissions listed', r.body.submissions?.length === 3 && r.body.submissions.every((s) => s.notesVerified), r.body)

  // ---- 5. select winners (2 of 3 positions) and claim --------------------------------
  const aliceBefore = await balanceOf(accounts.alice.address)
  const bobBefore = await balanceOf(accounts.bob.address)
  const creatorBefore = await balanceOf(accounts.creator.address)
  await send('creator', board, boardArtifact.abi, 'approveWinners', [BigInt(onchainId), [accounts.bob.address, accounts.alice.address]])
  const returned = (reward * 2000n) / 10_000n
  check('unused 3rd-place payout returned to creator', (await balanceOf(accounts.creator.address)) - creatorBefore === returned)

  await send('bob', board, boardArtifact.abi, 'claimReward', [BigInt(onchainId)])
  await send('alice', board, boardArtifact.abi, 'claimReward', [BigInt(onchainId)])
  const first = (reward * 5000n) / 10_000n
  const second = (reward * 3000n) / 10_000n
  check('1st place receives 95% of their payout', (await balanceOf(accounts.bob.address)) - bobBefore === first - (first * 500n) / 10_000n)
  check('2nd place receives 95% of their payout', (await balanceOf(accounts.alice.address)) - aliceBefore === second - (second * 500n) / 10_000n)
  const claimFees = (first * 500n) / 10_000n + (second * 500n) / 10_000n
  check('treasury holds post fee + claim fees', (await balanceOf(TREASURY)) === fee + claimFees)

  // ---- 6. indexer picks everything up ------------------------------------------------
  console.log('\nIndexer')
  await waitFor(async () => {
    const x = await db.query(`SELECT onchain_status FROM bounties WHERE onchain_id = 1`)
    const claims = await db.query("SELECT COUNT(*)::int AS n FROM bounty_activity WHERE onchain_id = 1 AND kind = 'claimed'")
    return x.rows[0]?.onchain_status === 3 && claims.rows[0].n === 2
  }, 'indexer to mark bounty claimed and record both claims')
  const detail = await api('GET', `/bounties/${onchainId}`)
  check('bounty status is Claimed', detail.body.bounty.status === 3)
  check('winners recorded in position order', detail.body.bounty.winners[0] === accounts.bob.address.toLowerCase() && detail.body.bounty.winners[1] === accounts.alice.address.toLowerCase())
  r = await api('GET', `/bounties/${onchainId}/submissions`)
  const positions = Object.fromEntries(r.body.submissions.map((s) => [s.submitterWallet, s.position]))
  check('submission positions stamped (bob 1st, alice 2nd, carol none)', positions[accounts.bob.address.toLowerCase()] === 1 && positions[accounts.alice.address.toLowerCase()] === 2 && positions[accounts.carol.address.toLowerCase()] == null, positions)
  check('carol is marked not selected', r.body.submissions.find((s) => s.submitterWallet === accounts.carol.address.toLowerCase())?.status === 'not_selected')

  const fees = await waitFor(async () => {
    const x = await db.query(`SELECT kind, SUM(amount)::text AS total, COUNT(*)::int AS n FROM platform_fees GROUP BY kind ORDER BY kind`)
    return x.rows.length === 2 && x.rows[1].n === 2 ? x.rows : null
  }, 'platform fees to be indexed')
  check('fee ledger: one 0.5% post fee', fees[0].kind === 0 && BigInt(fees[0].total) === fee && fees[0].n === 1, fees)
  check('fee ledger: two 5% claim fees', fees[1].kind === 1 && BigInt(fees[1].total) === claimFees && fees[1].n === 2, fees)

  r = await api('GET', '/activity?limit=50')
  const kinds = r.body.items.map((a) => a.kind)
  for (const k of ['created', 'funded', 'submitted', 'winner', 'approved', 'claimed']) {
    check(`activity contains '${k}'`, kinds.includes(k), kinds)
  }

  r = await api('GET', '/admin/overview', { auth: tok.admin })
  const totalRevenue = BigInt(r.body.revenue.total)
  check('admin revenue total equals treasury income', totalRevenue === fee + claimFees, r.body.revenue)
  check('admin sees treasury balance from chain', BigInt(r.body.revenue.treasuryBalance) === fee + claimFees)
  r = await api('GET', '/admin/system', { auth: tok.admin })
  check('indexer lag is reported and small', r.body.indexer.lagBlocks !== null && r.body.indexer.lagBlocks < 20, r.body.indexer)

  r = await api('GET', '/me/summary', { auth: tok.bob })
  check('contributor summary shows net earnings', BigInt(r.body.earned) === first - (first * 500n) / 10_000n, r.body)
  r = await api('GET', '/stats')
  check('public stats expose paid out amount', BigInt(r.body.totalPaidOut) === first + second - claimFees, r.body)

  // ---- 7. activity cannot be forged, the old write endpoints are gone ----------------
  r = await api('POST', '/activity', { body: { onchainId: 1, action: 'claimed', description: 'forged' } })
  check('activity cannot be written by clients', r.status === 404 || r.status === 405, r.status)

  // ---- 8. rejecting hides it again ---------------------------------------------------
  r = await api('POST', `/admin/bounties/${onchainId}/moderation`, { auth: tok.admin, body: { decision: 'rejected', note: 'Spam' } })
  check('admin can reject', r.status === 200)
  r = await api('GET', '/bounties')
  check('rejected bounty disappears from the public list', r.body.total === 0)
  r = await api('GET', '/activity')
  check('rejected bounty disappears from public activity', r.body.total === 0)
  const audit = await api('GET', '/admin/audit', { auth: tok.admin })
  check('moderation actions are audited', audit.body.total >= 2, audit.body)

  // ---- 9. performance ----------------------------------------------------------------------
  console.log('\nPerformance')
  await db.query(`UPDATE bounties SET moderation_status = 'approved' WHERE onchain_id = 1`)
  const t0 = Date.now()
  for (let i = 0; i < 30; i += 1) await api('GET', `/bounties?limit=12&offset=${i}`)
  const avg = (Date.now() - t0) / 30
  check(`public list averages under 40ms locally (${avg.toFixed(1)}ms)`, avg < 40)
  const t1 = Date.now()
  await Promise.all(Array.from({ length: 60 }, () => api('GET', `/bounties/${onchainId}`)))
  check(`60 parallel detail reads finish under 1.5s (${Date.now() - t1}ms)`, Date.now() - t1 < 1500)
  await runEcosystemChecks({ api, tok, accounts, send, board, boardArtifact, usdc, mock, bountyCommitment, submissionCommitment, check, waitFor, db, reward })
  await runTrustChecks({ api, tok, accounts, send, board, boardArtifact, usdc, mock, bountyCommitment, submissionCommitment, check, waitFor, db, apiBase: API }, fakes)
  await runInsightChecks({ api, tok, accounts, send, board, boardArtifact, usdc, mock, bountyCommitment, submissionCommitment, check, waitFor, db, apiBase: API }, fakes)
} catch (err) {
  failures += 1
  console.error('\nE2E aborted:', err)
  console.error('\n--- server log ---\n' + serverLog.slice(-3000))
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`)
if (failures > 0 && serverLog.includes('Error')) console.log('\n--- server log tail ---\n' + serverLog.slice(-2000))
await shutdown(failures === 0 ? 0 : 1)
