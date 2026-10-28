# FixBounty — Project Memory

## What This App Does

FixBounty is an onchain bounty platform for open-source developers. Maintainers post USDC rewards for bug fixes; contributors submit work; creators approve the best submission; the approved contributor claims USDC directly from the smart contract. Built on Arc Testnet.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, React Router v7
- Auth: Firebase Authentication (Google sign-in) via `firebase` npm package
- Off-chain: Firebase Firestore (bounty descriptions, submission notes, activity log)
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains` as `arcTestnet`)
- Token: USDC (6 decimals, address: 0x3600000000000000000000000000000000000000, Arc Testnet)

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| BountyBoard | Arc Testnet | 0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb | https://explorer.testnet.arc.io/address/0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb |

Constructor arg: `_usdc = 0x3600000000000000000000000000000000000000` (Arc Testnet USDC)

Deploy tx: 0xb8a5afdd71d4ea371eec9a5f380049ac26aeb8630afdd9536257cf244084e870

## Key Files

- `src/App.tsx` — Router root (thin, imports all pages)
- `src/main.tsx` — App entry point with all providers (BrowserRouter, WagmiProvider, AuthProvider)
- `src/firebase.ts` — Firebase app/auth/db init
- `src/contexts/AuthContext.tsx` — Auth state + Google sign-in
- `src/lib/contract.ts` — Contract address, ABI, chain config
- `src/lib/bountyTypes.ts` — Shared types, normalization, error parsing
- `src/lib/firestore.ts` — All Firestore read/write helpers
- `src/hooks/useBounty.ts` — wagmi hooks for contract reads
- `src/pages/Landing.tsx` — Homepage
- `src/pages/Explore.tsx` — Bounty explorer
- `src/pages/BountyDetail.tsx` — Full bounty lifecycle UI
- `src/pages/CreateBounty.tsx` — 3-step create+fund flow
- `src/pages/Dashboard.tsx` — User dashboard
- `src/pages/Profile.tsx` — Profile + wallet link
- `src/pages/ActivityFeed.tsx` — Activity log
- `src/pages/Help.tsx` — Help, security notes, setup guide
- `src/components/layout/Layout.tsx` — App shell with nav + footer
- `src/components/ui/` — StatusBadge, BountyCard, NetworkGuard
- `contracts/BountyBoard.sol` — Main contract
- `contracts/test/BountyBoard.Unit.t.sol` — 62 unit tests
- `contracts/test/BountyBoard.Fuzz.t.sol` — 7 fuzz tests
- `contracts/test/BountyBoard.Invariant.t.sol` — 3 invariants

## Contract State Machine

```
Open → Funded → Approved → Claimed
         ↓                   ↑ (creator after deadline + 7d grace)
       Refunded (deadline passed, not approved)
Open → Cancelled (creator, not yet funded)
Approved → Refunded (creator, deadline + CLAIM_GRACE_PERIOD = 7 days)
```

## Architecture Decisions

- Chain state is authoritative for funds, status, and approval. Firestore is display-only.
- Firebase UID = app identity. Wallet signature = blockchain identity. Never conflated.
- Bounty content hash is `sha256:<base64 prefix>` of the description (IPFS integration optional upgrade).
- Submission hashes follow same pattern.
- The BountyBoard has no admin/owner — all access control is per-bounty (creator / approvedContributor).
- ReentrancyGuard on claimReward and refundBounty; SafeERC20 for all transfers; CEI ordering throughout.

## Environment Variables Required

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — Firebase web config
- `VITE_BOUNTY_BOARD_ADDRESS` — contract address (pre-filled in code)

## To Run

```bash
bun install
bun run dev
```

## Contract Security Review

Balanced security review completed (2 rounds):
- Round 1 found 2 Critical findings (fund lock after approval, USDC blocklist brick)
- Both fixed by adding `refundAfterApproval` with 7-day grace period
- Round 2 returned clean (0 findings)
- Slither: 0 High/Medium findings (4 Low timestamp-usage notes, expected for deadline contracts)
- 72 forge tests all pass (unit, fuzz, invariant)
