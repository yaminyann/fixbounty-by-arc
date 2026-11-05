import { useState } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { useTx } from '@/hooks/useBountyContract'
import { useAttachNotes, useRefreshBounty } from '@/lib/api/queries'
import { errorMessage } from '@/lib/api/client'
import { MAX_REPORT_BYTES, encryptReport } from '@/lib/crypto'
import { clearDraft, loadDraft, notesDraftKey, saveDraft } from '@/lib/drafts'
import { SubmissionMetadataSchema, splitLines, submissionCommitment } from '@/lib/metadata'

interface Draft {
  description: string
  pullRequestUrl: string
  extra: string
  txHash?: string
  /** For confidential bounties: the encrypted report. The plaintext is never saved, and a retry must reuse these exact bytes. */
  cipher?: string
}

interface Props {
  onchainId: number
  wallet: string
  alreadySubmittedOnChain: boolean
  /** Confidential bounties take reports encrypted in the browser to this public key. */
  confidentialKey?: JsonWebKey | null
  confidential?: boolean
}

/**
 * Two steps: record the hash of your notes on-chain, then attach the notes themselves. If the second
 * step fails the form stays available in "attach only" mode, because the on-chain part cannot be repeated.
 */
export function SubmitWork({ onchainId, wallet, alreadySubmittedOnChain, confidential = false, confidentialKey = null }: Props) {
  const key = notesDraftKey(wallet, onchainId)
  const saved = loadDraft<Draft>(key)
  const [form, setForm] = useState<Draft>(saved ?? { description: '', pullRequestUrl: '', extra: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submittedOnChain, setSubmittedOnChain] = useState(alreadySubmittedOnChain)
  const [attachError, setAttachError] = useState<string | null>(null)
  const tx = useTx()
  const attach = useAttachNotes()
  const refresh = useRefreshBounty()

  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }))
  const hasCipher = confidential && Boolean(form.cipher)

  const parse = (description: string) => {
    const result = SubmissionMetadataSchema.safeParse({
      description,
      pullRequestUrl: form.pullRequestUrl,
      attachments: splitLines(form.extra),
    })
    if (!result.success) {
      const next: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] === 'attachments' ? 'extra' : String(issue.path[0])
        next[field] ??= issue.message
      }
      setErrors(next)
      return null
    }
    setErrors({})
    return result.data
  }

  const sendNotes = async (meta: NonNullable<ReturnType<typeof parse>>, txHash?: string) => {
    setAttachError(null)
    try {
      await attach.mutateAsync({ onchainId, ...meta, txHash })
      clearDraft(key)
      await refresh(onchainId)
      toast.success('Submission recorded.')
    } catch (err) {
      setAttachError(errorMessage(err))
    }
  }

  const submit = async () => {
    let description = form.description
    let cipher = form.cipher

    if (confidential) {
      if (!cipher) {
        if (!confidentialKey) return setAttachError('The creator has not published an encryption key, so reports cannot be sent yet.')
        if (form.description.trim().length < 10) return setErrors({ description: 'Describe the finding in at least a sentence.' })
        try {
          cipher = await encryptReport(form.description.trim(), confidentialKey)
        } catch (err) {
          return setErrors({ description: errorMessage(err) })
        }
      }
      description = cipher
    }

    const meta = parse(description)
    if (!meta) return
    // A confidential report is saved only as ciphertext. Encryption is randomised, so a retry must reuse this exact text.
    saveDraft(key, confidential ? { ...form, description: '', cipher } : form)
    if (confidential) set({ cipher, description: '' })

    if (!submittedOnChain) {
      try {
        const hash = await submissionCommitment(onchainId, meta)
        const { hash: txHash } = await tx.board('submitWork', [BigInt(onchainId), hash])
        saveDraft(key, { ...form, description: confidential ? '' : form.description, cipher, txHash })
        setSubmittedOnChain(true)
        await sendNotes(meta, txHash)
      } catch {
        // shown via tx.error
      }
      return
    }
    await sendNotes(meta, form.txHash)
  }

  const busy = tx.pending || attach.isPending

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {confidential && (
        <Callout tone="info" title="This bounty takes encrypted reports">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} aria-hidden /> Your report is encrypted in this browser to the creator's key before it leaves your device. Only the creator can read it, so keep your own copy.
          </span>
        </Callout>
      )}
      {submittedOnChain ? (
        <Callout tone="warn" title="Your submission is on-chain, but the notes are not attached yet">
          {hasCipher ? 'Your encrypted report is saved in this browser. Attach it now.' : 'Re-enter exactly what you wrote before. The text must match the hash recorded on-chain.'}
        </Callout>
      ) : (
        <p className="text-sm text-mute">One submission per bounty. Your text is hashed and the hash is written on-chain, so it cannot be edited later.</p>
      )}

      {!hasCipher && (
        <Field
          label={confidential ? 'Your report (encrypted before sending)' : 'What did you deliver?'}
          error={errors.description}
          hint={confidential ? `Up to ${MAX_REPORT_BYTES} characters. Include steps to reproduce and impact.` : 'Explain the work and how the creator can verify it.'}
        >
          <Textarea rows={5} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={confidential ? MAX_REPORT_BYTES : 5000} />
        </Field>
      )}
      <Field
        label="Main link"
        error={errors.pullRequestUrl}
        hint={
          confidential
            ? 'Public and not encrypted. Do not put details of the weakness here. Link the project or the bounty page.'
            : 'A GitHub pull request or repository, a design file, a document or a report.'
        }
      >
        <Input type="url" inputMode="url" placeholder="https://github.com/org/repo/pull/123" value={form.pullRequestUrl} onChange={(e) => set({ pullRequestUrl: e.target.value })} />
      </Field>
      {!confidential && (
        <Field label="More links" optional error={errors.extra} hint="One link per line: documents, demos, videos or screenshots. Image links show as previews.">
          <Textarea rows={3} value={form.extra} onChange={(e) => set({ extra: e.target.value })} />
        </Field>
      )}

      {(tx.error || attachError) && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tx.error ?? attachError}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {submittedOnChain ? 'Attach notes' : confidential ? 'Encrypt and submit' : 'Submit work'}
      </Button>
    </form>
  )
}
