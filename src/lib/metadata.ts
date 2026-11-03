import { z } from 'zod'

/**
 * Canonical off-chain metadata and its on-chain commitment.
 *
 * This file mirrors server/src/lib/metadata.ts byte for byte in behaviour: the browser hashes
 * the canonical JSON with SHA-256 and writes `sha256:<hex>` on-chain, and the server recomputes
 * it before accepting the text. Change both files together.
 */

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter a full link, for example https://github.com/org/repo/pull/12')
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed')

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(24, 'Tags can be up to 24 characters')
  .regex(/^[a-z0-9][a-z0-9+#._-]*$/, 'Tags may contain letters, numbers and + # . _ -')

export const BountyMetadataSchema = z.object({
  title: z.string().trim().min(3, 'Title needs at least 3 characters').max(200, 'Title can be up to 200 characters'),
  description: z.string().trim().min(10, 'Describe the problem in at least 10 characters').max(10_000),
  acceptanceCriteria: z.string().trim().min(5, 'Say how the fix will be judged').max(5_000),
  tags: z.array(tag).max(8, 'Use up to 8 tags').default([]),
  links: z.array(httpUrl).max(5, 'Add up to 5 links').default([]),
})

export const SubmissionMetadataSchema = z.object({
  description: z.string().trim().min(10, 'Explain what you changed in at least 10 characters').max(5_000),
  pullRequestUrl: httpUrl,
  attachments: z.array(httpUrl).max(5, 'Add up to 5 extra links').default([]),
})

export type BountyMetadata = z.infer<typeof BountyMetadataSchema>
export type SubmissionMetadata = z.infer<typeof SubmissionMetadataSchema>

const dedupe = (values: string[]) => [...new Set(values)]

export function canonicalBountyJson(meta: BountyMetadata): string {
  return JSON.stringify({
    v: 1,
    title: meta.title,
    description: meta.description,
    acceptanceCriteria: meta.acceptanceCriteria,
    tags: dedupe(meta.tags),
    links: dedupe(meta.links),
  })
}

export function canonicalSubmissionJson(bountyId: number, meta: SubmissionMetadata): string {
  return JSON.stringify({
    v: 1,
    bountyId,
    description: meta.description,
    pullRequestUrl: meta.pullRequestUrl,
    attachments: dedupe(meta.attachments),
  })
}

export async function sha256Commitment(canonicalJson: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot compute the content hash. Open the site over HTTPS.')
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson))
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

export const bountyCommitment = (meta: BountyMetadata) => sha256Commitment(canonicalBountyJson(meta))
export const submissionCommitment = (bountyId: number, meta: SubmissionMetadata) =>
  sha256Commitment(canonicalSubmissionJson(bountyId, meta))

/** Splits a free-text field into trimmed, non-empty lines. */
export const splitLines = (value: string): string[] =>
  value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** Splits comma separated tags. */
export const splitTags = (value: string): string[] =>
  value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
