# FixBounty — Onchain Bounty Platform with PostgreSQL Backend

FixBounty is a decentralized, onchain bounty platform for open-source developers built on **Arc Testnet** with a persistent **PostgreSQL** relational backend, **Docker** containerization, and **Coolify** deployment support.

Maintainers post USDC rewards for bug fixes and feature requests; contributors submit pull requests and demo artifacts; creators review and approve the best submission; the approved contributor claims USDC directly from the smart contract.

---

## Architecture Overview

- **Blockchain (Authoritative Financial State):** Smart contract on Arc Testnet (Chain ID: `5042002`). Handles escrow, funding, contributor approval, reward claims, and refunds.
- **Backend (Relational Data & Auth):** Express + TypeScript + `pg` + `viem` + `jose`. Verifies Google Firebase ID tokens, runs ECDSA signature challenges for wallet ownership verification, and stores rich metadata in PostgreSQL.
- **Database (PostgreSQL 16):** Fully normalized relational schema with ACID transactions, foreign keys, unique constraints, and automated idempotent migrations (`001_initial_schema.sql`).
- **Frontend (Web Application):** React 18, Vite, TypeScript, Tailwind CSS, React Router v7, wagmi v2, ConnectKit. Neo-Brutalist UI design.

---

## Documentation Suite

Detailed architecture, security audits, and deployment guides are available in the [`docs/`](docs) directory:

- [Coolify Deployment Guide](docs/COOLIFY_DEPLOYMENT.md) — Step-by-step Coolify deployment, volumes, domains, and health checks.
- [Architecture Specification](docs/ARCHITECTURE.md) — System design, onchain vs off-chain state, component hierarchy.
- [Security Model & Audit Report](docs/SECURITY.md) — Threat model, reentrancy analysis, CEI pattern, invariant results.
- [Testing & Quality Assurance](docs/TESTING.md) — 70 Foundry tests, TypeScript check, Oxlint, and browser test matrices.
- [Arc Testnet Deployment](docs/TESTNET_DEPLOYMENT.md) — Live contract parameters, verified bytecode, and onchain verification.

---

## Quick Start (Local Development)

### 1. Prerequisites
- [Bun](https://bun.sh) (v1.2+) or Node.js (v20+)
- [Docker & Docker Compose](https://www.docker.com/)
- Browser wallet (MetaMask, Rabby, Coinbase Wallet) configured for Arc Testnet

### 2. Start PostgreSQL via Docker
```bash
# Start persistent PostgreSQL container
docker compose -f docker-compose.dev.yml up -d

# Run database migrations
bun run server:migrate
```

### 3. Run Backend API Server
```bash
# Start Express backend on http://localhost:4000
bun run server
```

### 4. Run Frontend Application
```bash
# In a separate terminal, start Vite dev server on http://localhost:5173
bun run dev
```

The frontend Vite server automatically proxies `/api` requests to `http://localhost:4000`.

---

## Full Stack with Docker Compose

To run the entire production-like stack (PostgreSQL, Backend API, and Nginx Frontend) in Docker containers:

```bash
# Build and start all services
docker compose up -d --build

# View container status and health
docker compose ps

# View logs
docker compose logs -f

# Stop all services (preserves postgres database volume)
docker compose down
```

---

## Coolify Deployment

FixBounty includes native Coolify deployment support:

- **Compose Configuration:** `docker-compose.coolify.yml`
- **Validation & Health Script:** `./deploy-coolify.sh`
- **Full Guide:** [docs/COOLIFY_DEPLOYMENT.md](docs/COOLIFY_DEPLOYMENT.md)

### Deployment Steps in Coolify:
1. Create a new Service in Coolify and select **Docker Compose**.
2. Point Coolify to your repository or paste `docker-compose.coolify.yml`.
3. Set the Environment Variables (`DATABASE_URL`, `POSTGRES_PASSWORD`, Firebase credentials).
4. Assign your custom domain with HTTPS enabled.
5. Deploy! Migrations run automatically before the backend starts serving traffic.

---

## Deployed Smart Contract

| Contract | Network | Address | Explorer |
|---|---|---|---|
| **BountyBoard** | Arc Testnet (`5042002`) | `0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb` | [Arc Testnet Explorer](https://explorer.testnet.arc.io/address/0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb) |

- **Arc Testnet USDC:** `0x3600000000000000000000000000000000000000` (6 decimals)
- **Deployment Transaction:** `0xb8a5afdd71d4ea371eec9a5f380049ac26aeb8630afdd9536257cf244084e870`
- **Claim Grace Period:** 7 days (`CLAIM_GRACE_PERIOD = 604800`)

---

## Verification & Test Suite

```bash
# 1. TypeScript compilation check (0 errors)
bun run typecheck

# 2. Backend TypeScript compilation check (0 errors)
bun x tsc -p server/tsconfig.json --noEmit

# 3. Smart contract test suite (70 Foundry tests: 62 unit, 7 fuzz, 1 invariant)
bun run contracts:test
```

---

## License

MIT
