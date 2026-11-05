# BountyFi design direction

Read with `antislop.md`. This file is the direction; antislop is the filter.

## Product

An on-chain work and contribution ecosystem. Anyone can lock a USDC prize for a piece of work (code, design, research, community, testing), contributors submit, the creator reviews and picks winners, and each winner claims from the contract. Projects group bounties into public workspaces. The audience reads addresses, hashes and receipts, so the primary job of every screen is to make money state obvious: what is locked, who gets what, what is a fee, what happens next, and which facts can be verified on-chain.

## Dials

ENERGY 2 / RHYTHM 2 / MOTION 1

Premium minimal SaaS. Calm, ordered, light by default. Motion is limited to hover, focus, skeleton loading and dialogs opening.

## Palette

| Role | Value | Use |
|---|---|---|
| Ink | `#0A0A0A` | Text, primary buttons, the selected state |
| Paper | `#F9F9F7` | Page |
| Surface | `#FFFFFF` | Raised content, inputs |
| Line | `#E6E6E1` | Hairlines and borders (1px) |
| Mute | `#65655F` | Secondary text (5.4:1 on Paper) |
| Signal | `#FDE047` (deep `#EAB308`, soft `#FEF9C3`) | The brand mark, the single most important action on a screen, counters and unread markers |
| State | OK `#15803D`, Warn `#B45309`, Danger `#B91C1C`, Info `#1D4ED8` | Status badges, validation, callouts only |

Primary buttons are ink. Yellow is reserved, so it still means "look here". No gradients, no gradient text.

## Type

Space Grotesk for headings, DM Sans for body, JetBrains Mono for addresses, hashes and amounts (tabular numerals so columns align). Scale 12 / 14 / 16 / 20 / 26 / 32 / 44. Headings are semibold. Sentence case everywhere.

## Shape

Radius 6px on controls, 8 to 12px on containers. One-pixel Line borders; no heavy outlines and no offset shadows. Elevation is a hairline shadow on the one featured panel and a soft shadow on menus and dialogs. Prefer ruled lists and divided grids to stacks of cards.

## Information architecture

- Header: Explore, Categories, Projects, Workspace, How it works, notifications, Post a bounty, account.
- Workspace sidebar (signed in): Workspace (contributor dashboard, project dashboard, my projects, my contributions, team bounties), Activity (submissions, reward history, notifications), Profile (contributor profile, settings and wallet). On small screens the same groups live in the header menu.
- Bounty page: Overview, Milestones, Team, Submissions, History as tabs. Prize and actions stay in one sticky column.

## Motifs

The **payout ladder** (stepped bars per prize place) wherever a prize appears, and the **ledger line** (label, leader, amount) for every fee breakdown.

## Verifiable versus recorded

Every number that can be read from the contract is marked "Verified on-chain". Things only BountyFi stores (listing details, milestones, reviews, team roles, recurring programs, profile text) are marked "Recorded on BountyFi" or explained in a callout. Never present a database value as if it were on-chain.

## Content rules

- Only real data. Counts and totals come from the API and are hidden when zero. No testimonials, no logo bar, no invented activity, no scores or ratings.
- Fees are stated as they are: 0.5% added when a bounty is funded, 5% taken from each winner's payout.
- Empty, loading and error states say what happened and what to do next. Use skeletons while loading, toasts for results and confirmation dialogs for destructive actions; never browser alerts.
