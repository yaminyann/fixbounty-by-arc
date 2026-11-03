import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { useTx } from '@/hooks/useBountyContract'
import { useAttachNotes, useRefreshBounty } from '@/lib/api/queries'
import { errorMessage } from '@/lib/api/client'
import { clearDraft, loadDraft, notesDraftKey, saveDraft } from '@/lib/drafts'
import { SubmissionMetadataSchema, splitLines, submissionCommitment } from '@/lib/metadata'

interface Draft {
  description: string
  pullRequestUrl: string
  extra: string
  txHash?: string
}

/**
 * Two steps: record the hash of your notes on-chain, then attach the notes themselves. If the second
 * step fails the form stays available in "attach only" mode, because the on-chain part cannot be repeated.
 */
export function SubmitWork({ onchainId, wallet, alreadySubmittedOnChain }: { onchainId: number; wallet: string; alreadySubmittedOnChain: boolean }) {
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

  const parse = () => {
    const result = SubmissionMetadataSchema.safeParse({
      description: form.description,
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
    const meta = parse()
    if (!meta) return
    saveDraft(key, form)

    if (!submittedOnChain) {
      try {
        const hash = await submissionCommitment(onchainId, meta)
        const { hash: txHash } = await tx.board('submitWork', [BigInt(onchainId), hash])
        saveDraft(key, { ...form, txHash })
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
      {submittedOnChain ? (
        <Callout tone="warn" title="Your submission is on-chain, but the notes are not attached yet">
          Re-enter exactly what you wrote before. The text must match the hash recorded on-chain.
        </Callout>
      ) : (
        <p className="text-sm text-mute">One submission per bounty. Your text is hashed and the hash is written on-chain, so it cannot be edited later.</p>
      )}

      <Field label="What did you change?" error={errors.description} hint="Explain the fix and how to verify it.">
        <Textarea rows={5} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={5000} />
      </Field>
      <Field label="Pull request link" error={errors.pullRequestUrl}>
        <Input type="url" inputMode="url" placeholder="https://github.com/org/repo/pull/123" value={form.pullRequestUrl} onChange={(e) => set({ pullRequestUrl: e.target.value })} />
      </Field>
      <Field label="More links" optional error={errors.extra} hint="One link per line: a demo, a video, a test run.">
        <Textarea rows={3} value={form.extra} onChange={(e) => set({ extra: e.target.value })} />
      </Field>

      {(tx.error || attachError) && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tx.error ?? attachError}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {submittedOnChain ? 'Attach notes' : 'Submit work'}
      </Button>
    </form>
  )
}
