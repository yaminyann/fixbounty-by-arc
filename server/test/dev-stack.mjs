// Local stack for browser testing: anvil chain + throwaway Postgres + the API + a token service,
// seeded with bounties in different states.
//
//   anvil --port 8545 --block-time 1
//   docker run -d --name fb-test-pg -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=fixbounty -p 55432:5432 postgres:16-alpine
//   forge build && bun run abi
//   node node_modules/typescript/bin/tsc -p server && cp -r server/src/migrations server/dist/
//   node server/test/dev-stack.mjs            # then: npx vite --mode e2e  (see vite.config.ts)
//
// The token service signs Google-style ID tokens for whichever e-mail the browser asks for. It exists only
// for this local harness and trusts nothing outside it. Uses anvil's public test keys.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { createPublicClient, createWalletClient, http as viemHttp, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const RPC = 'http://127.0.0.1:8545'
const PG_ADMIN = 'postgresql://postgres:testpass@127.0.0.1:55432/postgres'
const DB_NAME = 'fixbounty_dev'
const API_PORT = 4100
const TOKEN_PORT = 9911
const PROJECT = 'e2e-project'
const TREASURY = '0x378862A20B312298dc54585CbabC531D70F9baE9'

const KEYS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  creator: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  alice: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  bob: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  carol: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
}
const accounts = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, privateKeyToAccount(v)]))
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const publicClient = createPublicClient({ chain, transport: viemHttp(RPC) })
const wallet = (who) => createWalletClient({ account: accounts[who], chain, transport: viemHttp(RPC) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- token service -------------------------------------------------------------------
const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' }
async function token(email) {
  const local = email.split('@')[0]
  return new SignJWT({ email, email_verified: true, name: local[0].toUpperCase() + local.slice(1) })
    .setProtectedHeader({ alg: 'RS256', kid: 'e2e' })
    .setSubject(`uid-${local}`)
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(privateKey)
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('access-control-allow-origin', '*')
    if (url.pathname === '/jwks.json') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [jwk] }))
    } else if (url.pathname === '/token') {
      res.end(await token(url.searchParams.get('email') ?? 'alice@test.dev'))
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  .listen(TOKEN_PORT, '127.0.0.1')

// ---- database --------------------------------------------------------------------------
const admin = new pg.Client({ connectionString: PG_ADMIN })
await admin.connect()
await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`)
await admin.query(`CREATE DATABASE ${DB_NAME}`)
await admin.end()
const DATABASE_URL = PG_ADMIN.replace(/\/[^/]*$/, `/${DB_NAME}`)
const db = new pg.Client({ connectionString: DATABASE_URL })
await db.connect()

// ---- contracts ---------------------------------------------------------------------------
const artifact = (file, name) => JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', file, `${name}.json`), 'utf8'))
const mock = artifact('MockERC20.sol', 'MockERC20')
const boardArtifact = artifact('BountyBoard.sol', 'BountyBoard')
const deployer = wallet('deployer')
const usdc = (await publicClient.waitForTransactionReceipt({ hash: await deployer.deployContract({ abi: mock.abi, bytecode: mock.bytecode.object, args: ['Mock USDC', 'mUSDC', 6] }) })).contractAddress
const boardReceipt = await publicClient.waitForTransactionReceipt({ hash: await deployer.deployContract({ abi: boardArtifact.abi, bytecode: boardArtifact.bytecode.object, args: [usdc, TREASURY] }) })
const board = boardReceipt.contractAddress

const send = async (who, address, abi, functionName, args = []) => {
  const hash = await wallet(who).writeContract({ address, abi, functionName, args })
  return publicClient.waitForTransactionReceipt({ hash })
}
for (const who of ['creator', 'alice', 'bob', 'carol']) {
  await send('deployer', usdc, mock.abi, 'mint', [accounts[who].address, 1_000_000_000_000n])
}

// ---- API ------------------------------------------------------------------------------------
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(API_PORT),
  DATABASE_URL,
  FIREBASE_PROJECT_ID: PROJECT,
  FIREBASE_JWKS_URL: `http://127.0.0.1:${TOKEN_PORT}/jwks.json`,
  ADMIN_EMAILS: 'admin@test.dev',
  ARC_RPC_URL: RPC,
  CHAIN_ID: '31337',
  BOUNTY_BOARD_ADDRESS: board,
  USDC_ADDRESS: usdc,
  TREASURY_ADDRESS: TREASURY,
  INDEXER_START_BLOCK: String(boardReceipt.blockNumber),
  INDEXER_POLL_MS: '700',
}
const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'inherit' })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.kill(); process.exit(0) })

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break
  } catch {
    // not up yet
  }
  await sleep(500)
}

const API = `http://127.0.0.1:${API_PORT}/api`
async function api(method, route, who, body) {
  const auth = who ? await token(`${who}@test.dev`) : null
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${route} ${res.status} ${JSON.stringify(json)}`)
  return json
}

const { bountyCommitment, submissionCommitment } = await import(pathToFileURL(path.join(root, 'server/dist/lib/metadata.js')).href)

for (const who of ['creator', 'alice', 'bob', 'carol']) {
  const ch = await api('POST', '/auth/wallet/challenge', who, { address: accounts[who].address })
  await api('POST', '/auth/wallet/link', who, { address: accounts[who].address, signature: await accounts[who].signMessage({ message: ch.message }) })
}

let nextId = 0
async function seedBounty({ title, description, reward, shares, days = 10, tags = [], fund = true, approve = true }) {
  const meta = {
    title,
    description,
    acceptanceCriteria: 'The change is merged in a pull request that passes the existing tests and is covered by a new one.',
    tags,
    links: ['https://github.com/example/project/issues/' + (100 + nextId)],
  }
  const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 86400)
  await send('creator', board, boardArtifact.abi, 'createBounty', [title, bountyCommitment(meta), reward, deadline, shares])
  const id = ++nextId
  await api('POST', '/bounties', 'creator', { ...meta, onchainId: id })
  if (fund) {
    const total = reward + (reward * 50n) / 10_000n
    await send('creator', usdc, mock.abi, 'approve', [board, total])
    await send('creator', board, boardArtifact.abi, 'fundBounty', [BigInt(id)])
    await api('POST', `/bounties/${id}/refresh`)
  }
  if (approve) await api('POST', `/admin/bounties/${id}/moderation`, 'admin', { decision: 'approved' })
  return id
}
async function submit(who, id, text) {
  const meta = { description: text, pullRequestUrl: `https://github.com/example/project/pull/${id * 10 + who.length}`, attachments: [] }
  await send(who, board, boardArtifact.abi, 'submitWork', [BigInt(id), submissionCommitment(id, meta)])
  await api('POST', `/bounties/${id}/submissions`, who, meta)
}

const usd = (n) => BigInt(n) * 1_000_000n
const a = await seedBounty({
  title: 'Dark mode flashes white on page reload',
  description:
    'When a visitor reloads any page with dark mode on, the page paints white for about 200 ms before the theme loads.\n\nThe theme class is applied from a React effect, which runs after first paint. It should be set by a script in the document head before the body renders.\n\nSteps to reproduce: enable dark mode, hard reload, watch the first frame.',
  reward: usd(500),
  shares: [5000, 3000, 2000],
  tags: ['react', 'css', 'ui'],
})
const b = await seedBounty({
  title: 'Date picker crashes when the locale uses a non-Latin calendar',
  description: 'Selecting a date with the Thai Buddhist calendar throws a RangeError in the formatting helper. A fix needs a regression test for at least two non-Gregorian locales.',
  reward: usd(120),
  shares: [10000],
  tags: ['typescript', 'i18n'],
})
const c = await seedBounty({
  title: 'Memory leak in the websocket reconnect loop',
  description: 'Each reconnect attempt leaves the previous socket listeners attached. After a few hours of flaky network the tab holds hundreds of megabytes.',
  reward: usd(300),
  shares: [2500, 2500, 2500, 2500],
  tags: ['rust', 'websocket'],
  days: 3,
})
await seedBounty({
  title: 'CLI exits with code 0 when the config file is invalid',
  description: 'The validate command prints an error but exits 0, so CI pipelines treat a broken config as a pass.',
  reward: usd(60),
  shares: [10000],
  tags: ['cli', 'go'],
  approve: false,
})
const e = await seedBounty({ title: 'Typo-safe enum parsing in the importer', description: 'Unknown enum strings are silently mapped to the first value instead of failing the import.', reward: usd(90), shares: [6000, 4000], tags: ['python'] })

await submit('alice', a, 'Moved theme initialisation into an inline script in index.html so the class is set before first paint, and added a Playwright check that screenshots the first frame.')
await submit('bob', a, 'Reads the stored preference in a blocking head script and falls back to prefers-color-scheme. Includes a unit test for the fallback order.')
await submit('carol', c, 'Detaches listeners in the close handler and adds a test that opens and closes 500 sockets and asserts the listener count stays flat.')
await submit('alice', e, 'Importer now throws on unknown values with the offending row number.')
await submit('bob', e, 'Adds strict mode with a clear error and a flag to keep the old lenient behaviour.')
await send('creator', board, boardArtifact.abi, 'approveWinners', [BigInt(e), [accounts.alice.address, accounts.bob.address]])
await send('alice', board, boardArtifact.abi, 'claimReward', [BigInt(e)])
await api('POST', `/bounties/${e}/refresh`)
void b

console.log(`
Dev stack ready
  API         http://127.0.0.1:${API_PORT}
  tokens      http://127.0.0.1:${TOKEN_PORT}/token?email=<name>@test.dev
  contract    ${board}
  usdc        ${usdc}
  chain       31337 (${RPC})
Browser identities (set localStorage e2e_identity and e2e_wallet):
  creator@test.dev ${accounts.creator.address}
  alice@test.dev   ${accounts.alice.address}
  bob@test.dev     ${accounts.bob.address}
  carol@test.dev   ${accounts.carol.address}
  admin@test.dev   (admin, no wallet needed)
`)
await db.end()
setInterval(() => undefined, 1 << 30)
