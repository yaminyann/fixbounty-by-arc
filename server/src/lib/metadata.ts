import crypto from 'node:crypto'
import { z } from 'zod'

/**
 * Canonical off-chain metadata and its on-chain commitment.
 *
 * The browser (src/lib/metadata.ts) builds the exact same canonical JSON, hashes it with
 * SHA-256 and stores the digest on-chain as `sha256:<hex>`. The server recomputes the
 * digest, so a description can never drift from what the contract committed to.
 */

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed')

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(24)
  .regex(/^[a-z0-9][a-z0-9+#._-]*$/, 'Tags may contain letters, numbers and + # . _ -')

export const BountyMetadataSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(10_000),
  acceptanceCriteria: z.string().trim().min(5).max(5_000),
  tags: z.array(tag).max(8).default([]),
  links: z.array(httpsUrl).max(5).default([]),
})

export const SubmissionMetadataSchema = z.object({
  description: z.string().trim().min(10).max(5_000),
  pullRequestUrl: httpsUrl,
  attachments: z.array(httpsUrl).max(5).default([]),
})

export type BountyMetadata = z.infer<typeof BountyMetadataSchema>
export type SubmissionMetadata = z.infer<typeof SubmissionMetadataSchema>

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

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

export function sha256Commitment(canonicalJson: string): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex')}`
}

export function bountyCommitment(meta: BountyMetadata): string {
  return sha256Commitment(canonicalBountyJson(meta))
}

export function submissionCommitment(bountyId: number, meta: SubmissionMetadata): string {
  return sha256Commitment(canonicalSubmissionJson(bountyId, meta))
}
