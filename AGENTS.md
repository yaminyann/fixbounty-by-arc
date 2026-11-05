# BountyFi: Project Memory

## What this app does

An escrow board for open-source bug fixes on Arc Testnet. Maintainers lock a USDC prize in `BountyBoard`; contributors submit work; the maintainer picks winners (one, several, or ranked places); each winner claims their share from the contract. An admin must approve a bounty before it appears on the website. Platform fees go to a fixed treasury wallet.

## Contribution ecosystem (migration 004)

BountyFi is a work and contribution platform, not only a bug board. Application-level modules sit around the unchanged contract: categories (table, admin-managed), project workspaces, listing details on bounties (category, difficulty, skills, work mode, project, instructions, eligibility; not part of the on-chain hash), milestones, review threads, team coordination, recurring programs, contributor profiles and notifications. Full detail and limits: `docs/ECOSYSTEM.md`.

- The contract escrows one prize per bounty and pays by place. Milestones, team shares and recurring programs are coordination records and never move USDC. Say so in the UI wherever they appear.
- Mark facts as verified on-chain only when they come from indexed contract events (`SourceBadge`). Never show invented statistics, scores or activity.
- Hashed bounty and submission text is still immutable. New optional fields go in the `listing` object of `POST /api/bounties` or in `POST /api/bounties/:id/listing`, never into `src/lib/metadata.ts`.
- Routes: `server/src/routes/{projects,reviews,milestones,teams,profiles,categories,workspace,notifications}.ts`, shared rules in `server/src/lib/ecosystem.ts`, notifications via `services/notify.ts`. Frontend hooks and types: `src/lib/api/ecosystem.ts`; navigation: `src/lib/nav.ts`; workspace shell: `components/layout/Sidebar.tsx`.
- `server/test/ecosystem.mjs` extends the end-to-end run; keep it passing.
- Applications, disputes, webhooks, analytics (migration 006): `routes/{applications,disputes,insights}.ts`, `services/webhooks.ts`. Applications and disputes are coordination and mediation records only; they never block a submission or move USDC. Project webhooks go only to allowlisted chat hosts and are sent after the indexer commits. `server/test/insights.mjs` covers them. The leaderboard honours `hide_from_leaderboard`.
- Trust and teamwork (migration 005, `routes/trust.ts`, `services/{github,alerts}.ts`, `lib/crypto.ts`): creator record from chain events, GitHub PR checks (only github.com pull links are fetched), README badge, encrypted reports (WebCrypto in the browser; the server only ever stores ciphertext and a signature-wrapped private key), saved searches with allowlisted webhooks, project member roles. Project members review but never pick winners: only the bounty's creator wallet can call `approveWinners`. `server/test/trust.mjs` covers all of it. Optional env: `GITHUB_API_URL`, `ALERT_WEBHOOK_HOSTS` (tests only).
- Card purchases of USDC: `routes/onramp.ts`, `services/onramp.ts`, `features/bounty/BuyUsdc.tsx`. Circle Onramp session for the user's own verified wallet; the API key `ONRAMP_API_KEY` is server-only. The contract is untouched. `server/test/insights.mjs` covers it.

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind, React Router v7, wagmi v2 + viem v2 (own wallet dialog, no ConnectKit), TanStack Query.
- Auth: Firebase Authentication (Google) in the browser. The server verifies the ID token with jose against Google's JWKS.
- Backend: Express 4 + `pg` + viem + zod, run with Bun (`server/src/index.ts`). PostgreSQL is the read model; the chain is authoritative.
- Contracts: Solidity 0.8.28 + Foundry in `contracts/`. `bun run contracts:test`, `bun run contracts:build`. On this Windows machine forge runs through WSL: `wsl.exe -e bash -lc 'cd /mnt/f/... && ~/.foundry/bin/forge test'`.
- Chain: Arc Testnet (5042002). USDC ERC-20 `0x3600000000000000000000000000000000000000` (6 decimals; gas is the same USDC at 18 decimals, never mix the two views).

## Business rules (enforced in the contract unless noted)

- Fees: 0.5% (`POST_FEE_BPS = 50`) added to the creator's payment at `fundBounty`, never refunded. 5% (`CLAIM_FEE_BPS = 500`) deducted from each winner's payout at `claimReward`. Both are pushed straight to the immutable `treasury`.
- Prize places: `createBounty(..., sharesBps[])`, 1 to 10 places, shares non-increasing and summing to 10000. Position 1 absorbs rounding dust. The creator calls `approveWinners(id, winners[])` once; winners fill places from the top; unused places return to the creator immediately.
- Claim window: `CLAIM_GRACE_PERIOD` (7 days) is measured from `approvedAt`, not from the deadline.
- Creator refund: after the deadline if there were no submissions, otherwise after `deadline + REVIEW_PERIOD` (7 days).
- No owner or admin role in the contract.
- Moderation (server only): `bounties.moderation_status` is `pending | approved | rejected`. Only approved and metadata-verified bounties are public. Admins can approve only funded bounties.

## Architecture decisions

- Chain state is authoritative for money, status, winners. The indexer (`server/src/services/indexer.ts`) walks contract events in chunks (the Arc RPC rejects `eth_getLogs` ranges above about 1000 blocks), re-reads touched bounties, and writes `bounties`, `submissions`, `bounty_activity`, `platform_fees`. It takes a Postgres advisory lock so only one instance indexes. Activity and fees come only from events and cannot be forged through the API.
- Text integrity: `contentHash` and `submissionHash` are `sha256:<hex>` of canonical JSON (`src/lib/metadata.ts` mirrors `server/src/lib/metadata.ts`; change both together). The server rejects text that does not match the on-chain hash. Bounty text is immutable after publishing.
- Identity: a user is a Google account plus a wallet linked by a signed challenge (`/api/auth/wallet/*`). One wallet per account, one account per wallet. Write endpoints require both. Frontend state machine is `IdentityContext` (`none`, `needs_google`, `needs_wallet`, `needs_link`, `wallet_mismatch`, `ready`).
- Admin = verified Google e-mail in `ADMIN_EMAILS`, checked server-side. No shared password, nothing admin-related in the browser bundle.
- The browser gets contract and fee configuration from `GET /api/config`, so changing `BOUNTY_BOARD_ADDRESS` needs no frontend rebuild.
- Firestore is not used. Firebase is only for Google sign-in.
- Performance: lists are one indexed SQL query with partial indexes, a 3 second TTL cache and cache headers; the auth user lookup is cached; pages are lazy chunks; the wallet UI is loaded on demand.

## Key files

- `contracts/BountyBoard.sol`, `contracts/test/*.t.sol` (97 tests), `contracts/script/DeployBountyBoard.s.sol`
- `scripts/export-abi.ts` (`bun run abi`) regenerates `src/lib/bountyBoardAbi.ts` and `server/src/abi.ts` from the forge build
- `server/src/index.ts`, `config.ts`, `auth.ts`, `chain.ts`, `routes/{auth,bounties,me,public,admin}.ts`, `services/{indexer,bountySync,projections}.ts`, `migrations/003_v2_platform.sql`
- `server/test/e2e.mjs` (backend end-to-end against anvil + Postgres), `server/test/dev-stack.mjs` (seeded stack for browser testing with `vite --mode e2e`)
- `src/App.tsx` (lazy routes), `src/contexts/{AuthContext,IdentityContext}.tsx`, `src/lib/api/*`, `src/hooks/useBountyContract.ts`, `src/features/bounty/*` (fund, submit, select winners, claim, reclaim), `src/pages/*`, `src/pages/admin/*`
- Brand: the product is BountyFi (domain bountyfi.xyz). Source logos in `brand/`; `scripts/generate-brand-assets.py` writes `public/` icons, `public/brand/{mark,lockup}.png` and `public/og.png`. The footer carries no personal credits.
- Server config falls back to the known testnet deployment when `BOUNTY_BOARD_ADDRESS` is blank, and `/api/config` answers even before PostgreSQL is ready.
- `DESIGN.md` is the design direction (black and signal yellow, payout ladder motif). `antislop` rules apply to UI work.
- Generated by Arc Studio, do not edit: `src/onchain-facts.ts`, `src/onchain-money.ts`, `src/onchain-wait.ts`, `src/tracing.ts`, `src/console-capture.ts`.

## Operating notes

- `.env.example` documents every variable. `FIREBASE_PROJECT_ID` must equal `VITE_FIREBASE_PROJECT_ID`.
- After deploying a new contract: set `BOUNTY_BOARD_ADDRESS` and `INDEXER_START_BLOCK`, restart the backend. Old-contract tables are kept as `legacy_*`.
- BountyBoard v2 is deployed on Arc Testnet at `0x2A35C6B7f8D2aaB52493Fb2CDedB84d474989329` (deploy block 70667442, treasury `0x378862A20B312298dc54585CbabC531D70F9baE9`). Deployer was a throwaway wallet; the contract has no owner so the key has no ongoing power.
- The previous contract (`0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb`) used a different ABI and is no longer supported by the app.
- Vite inlines every `VITE_` variable if code reads the whole `import.meta.env` object. Read individual variables only (see `src/lib/env.ts`), and keep secrets out of `VITE_` names anyway.
- Do not put secrets in `VITE_` variables, Dockerfile build args, or committed files.
- The contract has not had an independent audit.
