# FixBounty

An escrow board for open-source bug fixes, built on Arc Testnet. A maintainer locks a USDC prize in a smart contract, contributors submit fixes, the maintainer picks the winners, and each winner claims their share from the contract.

## How it works

- **Prizes.** A bounty has one to ten prize places. One winner, an equal split, or ranked places such as 50 / 30 / 20. The maintainer can pick fewer winners than places; unused prizes return to the maintainer in the same transaction.
- **Fees.** 0.5% is added on top of the prize when a bounty is funded. Each winner pays 5% of their own payout when they claim. Every fee goes to the platform wallet set in the contract (`TREASURY_ADDRESS`).
- **Review.** A bounty is on-chain as soon as it is created, but it only appears on the website after an admin approves it. Admins sign in with Google; there is no admin password.
- **Identity.** Every action needs a Google account and a wallet linked together by a signed message. A wallet belongs to one account.
- **Integrity.** The bounty description and each submission are hashed (SHA-256) and the hash is stored on-chain. The server recomputes the hash before accepting text, so the text cannot drift from what the contract committed to.

## Architecture

| Layer | What it does |
|---|---|
| `contracts/BountyBoard.sol` | Escrow, prize split, fees, claim and refund rules. No owner or admin functions. |
| `server/` | Express API on PostgreSQL. A chain indexer mirrors contract state and events into the database, so every page is one indexed query instead of RPC fan-out. Admin moderation, revenue ledger, audit log. |
| `src/` | React 18, Vite, Tailwind, wagmi v2. Pages are code-split; the wallet picker and Firebase load on demand. |

Chain state is authoritative for money, status and winners. PostgreSQL holds the readable text, moderation decisions and a fast copy of chain state.

## Run it locally

Requires Node 20+ or Bun, Docker, and [Foundry](https://getfoundry.sh).

```bash
docker compose -f docker-compose.dev.yml up -d      # PostgreSQL on localhost:5432
cp .env.example .env                                # fill it in, see below
bun install
bun run server                                      # API on :4000, runs migrations, starts the indexer
bun run dev                                         # web on :5173, proxies /api to :4000
```

For local work set `DATABASE_URL=postgresql://postgres:devpassword@localhost:5432/fixbounty`.

### Environment

See `.env.example`; every variable is explained there. The ones that need a decision:

- `TREASURY_ADDRESS`: wallet that receives all platform fees. It is baked into the contract at deployment.
- `BOUNTY_BOARD_ADDRESS` and `INDEXER_START_BLOCK`: filled in after you deploy the contract.
- `FIREBASE_PROJECT_ID`: must equal `VITE_FIREBASE_PROJECT_ID`, because the server verifies ID tokens against it.
- `ADMIN_EMAILS`: Google accounts allowed into `/admin`. Matched against the verified e-mail on the token.

Only `VITE_` variables reach the browser, and none of them is a secret.

## Deploying the contract

```bash
bun run contracts:test                              # 97 tests: unit, fuzz, invariants
cast wallet import deployer --interactive           # stores the deployer key in an encrypted keystore
USDC_ADDRESS=0x3600000000000000000000000000000000000000 \
TREASURY_ADDRESS=0x378862A20B312298dc54585CbabC531D70F9baE9 \
forge script contracts/script/DeployBountyBoard.s.sol:DeployBountyBoard \
  --rpc-url https://rpc.testnet.arc.io --account deployer --broadcast
```

The script prints the contract address and the deployment block. Put them in `BOUNTY_BOARD_ADDRESS` and `INDEXER_START_BLOCK`, redeploy the backend, and check it:

```bash
BOUNTY_BOARD_ADDRESS=0x... TREASURY_ADDRESS=0x... bun run scripts/verify-deployment.ts
```

Never pass a private key on the command line. Fund the deployer from the [Circle faucet](https://faucet.circle.com).

If the ABI changes: `forge build && bun run abi` regenerates `src/lib/bountyBoardAbi.ts` and `server/src/abi.ts`.

## Deploying the site

- **Coolify:** use `docker-compose.coolify.yml`. Create a PostgreSQL resource, set `DATABASE_URL` to it, the API joins Coolify's shared `coolify` network automatically, so it reaches that database by its internal hostname, and provide the variables from `.env.example`.
- **Single machine:** `docker-compose.yml` runs PostgreSQL, the API and nginx together. `./deploy-coolify.sh` validates `.env`, builds, and waits for health.

Migrations run on every start. Tables from the previous contract are kept as `legacy_*` and can be dropped once you no longer need them.

## Tests

```bash
bun run contracts:test        # Foundry unit, fuzz and invariant tests
bun run typecheck             # frontend
node node_modules/typescript/bin/tsc -p server --noEmit
```

`server/test/e2e.mjs` runs the whole backend against a local chain and a throwaway PostgreSQL: wallet linking, metadata hashing, moderation, multi-winner payouts, fee ledger, indexer, permissions. `server/test/dev-stack.mjs` starts the same stack seeded with sample bounties for browser testing (`vite --mode e2e`). Both use anvil's public test keys and must never touch a real network.

## Admin console

`/admin` (verified Google e-mail on `ADMIN_EMAILS`):

- **Review queue:** pending bounties, with description, creator and prize split. Approve publishes, reject needs a reason.
- **All bounties, Submissions, Users:** searchable, paginated.
- **Revenue:** fees collected by type, a 14-day chart, the fee wallet balance read from the chain.
- **Chain activity, Audit log, System:** raw contract events, every admin decision, and indexer, database and RPC health.
