# FixBounty design direction

Read with `antislop.md`. This file is the direction; antislop is the filter.

## Product

An escrow board where maintainers lock a USDC prize for an open-source bug fix, contributors submit work, the maintainer picks the winners, and each winner claims from the contract. The audience is developers: people who read diffs, addresses, and receipts. The primary job of every screen is to make money state obvious: how much is locked, who gets what, what is taken as fee, what happens next.

## Dials

ENERGY 2 / RHYTHM 2 / MOTION 1

Design read: a transactional developer product for maintainers and contributors, in the project's existing black-and-signal-yellow brand, calmer and more ordered than the first version. Motion is limited to hover, focus, skeleton loading, and dialogs opening.

## Palette (core 3 + 1 accent; semantic colors only for state)

| Role | Name | Value | Why |
|---|---|---|---|
| Text, key borders | Ink | `#000000` | The brand's existing hard black; carries hierarchy through weight, not tint |
| Page | Paper | `#FAFAF8` | The existing page tone, cool enough to stay clear of cream |
| Surface | White | `#FFFFFF` | Raised content areas |
| Secondary text | Mute | `#66665F` | 5.4:1 on Paper |
| Hairlines | Line | `#E2E2DC` | Separates rows without competing with Ink |
| Accent | Signal | `#FDE047` (deep `#EAB308`, soft `#FEF9C3`) | The brand yellow, used only for the primary action, the prize, and the active state |
| State | OK `#15803D`, Warn `#B45309`, Danger `#B91C1C`, Info `#1D4ED8` | | Only for status badges and validation |

## Type

- Display and headings: Space Grotesk, the brand's existing display face, kept for continuity with the logo and favicon.
- Body: DM Sans, kept for the same reason.
- Data (addresses, hashes, amounts in tables): JetBrains Mono with tabular numerals, so columns of money line up.

Scale: 12 / 14 / 16 / 20 / 28 / 44. Body line length stays under 70 characters. Sentence case everywhere. No all-caps tracked labels.

## Shape

Radius 2px on controls and rows, 4px on containers. Primary containers carry a 2px Ink border; secondary surfaces use a 1px Line border. The hard offset shadow (`3px 3px 0 #000`) belongs to the primary button and the single featured panel on a screen, nowhere else.

## Identity motif

The **payout ladder**: stepped horizontal bars for 1st, 2nd and 3rd place, scaled to each position's share. It appears wherever a prize appears (list rows, detail, create form, calculator), so the product's new capability is visible at a glance. The second motif is the **ledger line**: label, dotted leader, amount, used for every fee breakdown, so every deduction is itemised.

## Layout

Left-aligned. Lists are ruled rows, not card grids. The detail page is a two-column reading layout with one sticky prize panel. Sections change composition from one to the next (split hero, calculator beside prose, two unequal columns, a single closing line) instead of repeating a centred title over a card grid.

## Content rules

- Only real data. Counts and totals come from the API and are hidden when zero.
- No testimonials, no logo bar, no invented activity.
- Fees are stated as they are: 0.5% added when a bounty is funded, 5% taken from each winner's payout.
- Empty, loading and error states say what happened and what to do next.
