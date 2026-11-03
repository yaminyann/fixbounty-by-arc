import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseEventLogs } from 'viem'
import { Check, CircleAlert } from 'lucide-react'
import { RequireIdentity } from '@/components/layout/RequireIdentity'
import { FeeLedger } from '@/components/bounty/FeeLedger'
import { PrizeStructureEditor } from '@/components/bounty/PrizeStructureEditor'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Callout, PageHeader, Spinner } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { useIdentity } from '@/contexts/IdentityContext'
import { BOUNTY_BOARD_ABI, useTx, useUsdcAccount } from '@/hooks/useBountyContract'
import { errorMessage } from '@/lib/api/client'
import { useAppConfig, usePublishBounty, useRefreshBounty } from '@/lib/api/queries'
import { bountyDraftKey, clearDraft, loadDraft, saveDraft } from '@/lib/drafts'
import { BountyMetadataSchema, bountyCommitment, splitLines, splitTags } from '@/lib/metadata'
import { computePayouts, formatUsdc, parseUsdc, postFee } from '@/lib/money'
import { DEFAULT_PRIZE_CONFIG, resolveShares, validateShares, type PrizeConfig } from '@/lib/prize'

type StepKey = 'create' | 'publish' | 'approve' | 'fund'
type StepState = 'todo' | 'active' | 'done' | 'error'

const STEP_LABELS: Record<StepKey, string> = {
  create: 'Create the bounty on-chain',
  publish: 'Publish the description',
  approve: 'Allow the contract to take the USDC',
  fund: 'Fund the prize',
}

interface FormState {
  title: string
  description: string
  acceptanceCriteria: string
  tags: string
  links: string
  reward: string
  deadline: string
  prize: PrizeConfig
}

interface Draft {
  form: FormState
  deadlineSec: number
  onchainId: number
  txHash: string
  published: boolean
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + 14 * 24 * 3600 * 1000)
  d.setHours(23, 59, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EMPTY: FormState = {
  title: '',
  description: '',
  acceptanceCriteria: '',
  tags: '',
  links: '',
  reward: '',
  deadline: defaultDeadline(),
  prize: DEFAULT_PRIZE_CONFIG,
}

const initialSteps = (): Record<StepKey, StepState> => ({ create: 'todo', publish: 'todo', approve: 'todo', fund: 'todo' })

export default function CreateBounty() {
  const [params] = useSearchParams()
  const resumeId = Number(params.get('resume')) || null
  const id = useIdentity()
  const config = useAppConfig()
  const tx = useTx()
  const usdc = useUsdcAccount()
  const publish = usePublishBounty()
  const refresh = useRefreshBounty()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stepState, setSteps] = useState(initialSteps)
  const [touched, setTouched] = useState(false)
  const [running, setRunning] = useState(false)
  const [flowError, setFlowError] = useState<string | null>(null)
  const [localCreated, setCreated] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  const wallet = id.status === 'ready' ? id.address!.toLowerCase() : null
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  // A flow that stopped half way (page closed, wallet rejected, network drop) resumes from its saved draft.
  const draft = useMemo(() => (wallet && resumeId ? loadDraft<Draft>(bountyDraftKey(wallet, resumeId)) : null), [wallet, resumeId])
  const created = localCreated ?? draft?.onchainId ?? null
  const view = draft ? draft.form : form
  const steps: Record<StepKey, StepState> =
    touched || !draft ? stepState : { create: 'done', publish: draft.published ? 'done' : 'todo', approve: 'todo', fund: 'todo' }

  const reward = parseUsdc(view.reward)
  const shares = resolveShares(view.prize)
  const shareProblem = shares ? validateShares(shares) : 'empty'
  const fee = reward ? postFee(reward) : 0n
  const total = reward ? reward + fee : 0n
  const payouts = reward && shares && !shareProblem ? computePayouts(reward, shares) : null
  const lowBalance = reward !== null && usdc.balance !== undefined && usdc.balance < total
  const locked = created !== null || running

  const summaryLines = useMemo(
    () => [
      { label: 'Prize pool, held in escrow', value: reward ? `${formatUsdc(reward)} USDC` : '0 USDC' },
      { label: 'Platform fee, 0.5%', value: reward ? `${formatUsdc(fee, 4)} USDC` : '0 USDC' },
      { label: 'Leaves your wallet', value: reward ? `${formatUsdc(total, 4)} USDC` : '0 USDC', total: true },
    ],
    [reward, fee, total],
  )

  const validate = () => {
    const next: Record<string, string> = {}
    const meta = BountyMetadataSchema.safeParse({
      title: view.title,
      description: view.description,
      acceptanceCriteria: view.acceptanceCriteria,
      tags: splitTags(view.tags),
      links: splitLines(view.links),
    })
    if (!meta.success) {
      for (const issue of meta.error.issues) {
        const field = String(issue.path[0])
        next[field] ??= issue.message
      }
    } else if (new TextEncoder().encode(meta.data.title).length > 200) {
      next.title = 'Title can be up to 200 bytes'
    }

    if (!reward) next.reward = 'Enter the prize in USDC, for example 250 or 99.50'
    const deadlineMs = new Date(view.deadline).getTime()
    // Once the bounty exists on-chain its deadline is fixed, so only a new bounty needs this check.
    if (created === null) {
      if (!Number.isFinite(deadlineMs) || deadlineMs < Date.now() + 3600_000) next.deadline = 'Pick a deadline at least one hour from now'
      else if (deadlineMs > Date.now() + 366 * 24 * 3600_000) next.deadline = 'Pick a deadline within a year'
    }
    if (shareProblem) next.prize = 'Fix the prize split below'
    else if (payouts && payouts.some((p) => p === 0n)) next.reward = 'That prize is too small to split this many ways'

    setErrors(next)
    return { ok: Object.keys(next).length === 0, meta: meta.success ? meta.data : null, deadlineSec: Math.floor(deadlineMs / 1000) }
  }

  const mark = (key: StepKey, state: StepState) => setSteps((s) => ({ ...s, [key]: state }))

  const start = async () => {
    const { ok, meta, deadlineSec } = validate()
    const contractAddress = config.data?.contractAddress?.toLowerCase()
    if (!ok || !meta || !reward || !shares || !wallet || !contractAddress) return

    setRunning(true)
    setTouched(true)
    setFlowError(null)
    let onchainId = created
    let txHash = ''
    try {
      // 1. create
      if (onchainId === null) {
        mark('create', 'active')
        const commitment = await bountyCommitment(meta)
        const result = await tx.board('createBounty', [meta.title, commitment, reward, BigInt(deadlineSec), shares])
        const logs = parseEventLogs({
          abi: BOUNTY_BOARD_ABI,
          eventName: 'BountyCreated',
          logs: result.receipt.logs.filter((l) => l.address.toLowerCase() === contractAddress),
        })
        const newId = logs[0]?.args.bountyId
        if (newId === undefined) throw new Error('The bounty was created but its id could not be read. Open your dashboard to continue.')
        onchainId = Number(newId)
        txHash = result.hash
        setCreated(onchainId)
        saveDraft<Draft>(bountyDraftKey(wallet, onchainId), { form: view, deadlineSec, onchainId, txHash, published: false })
        mark('create', 'done')
      }

      // 2. publish metadata so admins can review it
      const saved = loadDraft<Draft>(bountyDraftKey(wallet, onchainId))
      if (!saved?.published) {
        mark('publish', 'active')
        await publish.mutateAsync({
          onchainId,
          ...meta,
          txHash: txHash || saved?.txHash || undefined,
        })
        saveDraft<Draft>(bountyDraftKey(wallet, onchainId), { ...(saved ?? { form: view, deadlineSec, onchainId, txHash }), published: true })
        mark('publish', 'done')
      }

      // 3. allowance
      const wanted = total
      if ((usdc.allowance ?? 0n) < wanted) {
        mark('approve', 'active')
        await tx.approveUsdc(wanted)
        await usdc.refetch()
      }
      mark('approve', 'done')

      // 4. fund
      mark('fund', 'active')
      await tx.board('fundBounty', [BigInt(onchainId)])
      mark('fund', 'done')
      clearDraft(bountyDraftKey(wallet, onchainId))
      await refresh(onchainId)
      setDone(true)
    } catch (err) {
      setSteps((s) => {
        const next = { ...s }
        for (const k of Object.keys(next) as StepKey[]) if (next[k] === 'active') next[k] = 'error'
        return next
      })
      setFlowError(tx.error ?? errorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  if (done && created) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Bounty funded" />
        <Callout tone="ok" title={`Bounty #${created} is funded and in review`}>
          An admin checks every bounty before it appears on the platform. You will see it in your dashboard now and on the explore page once it is approved.
        </Callout>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to={`/bounty/${created}`} variant="primary">
            View the bounty
          </ButtonLink>
          <ButtonLink to="/dashboard">Go to dashboard</ButtonLink>
        </div>
      </div>
    )
  }

  const stepCount = Object.values(steps).filter((s) => s === 'done').length

  return (
    <div>
      <PageHeader title="Post a bounty">
        Describe the bug, set the prize, and lock it in the contract. An admin reviews the bounty before contributors can see it.
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          className="space-y-10"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <fieldset className="space-y-5" disabled={locked}>
            <legend className="mb-4 font-display text-xl font-bold">The problem</legend>
            <Field label="Title" error={errors.title} hint="Name the bug, not the project.">
              <Input value={view.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Dark mode flashes white on reload" />
            </Field>
            <Field label="Description" error={errors.description} hint="What is broken, how to reproduce it, and where in the code to look.">
              <Textarea rows={8} value={view.description} onChange={(e) => set('description', e.target.value)} maxLength={10000} />
            </Field>
            <Field label="How a fix will be judged" error={errors.acceptanceCriteria} hint="Concrete checks. Contributors read this before they start.">
              <Textarea rows={4} value={view.acceptanceCriteria} onChange={(e) => set('acceptanceCriteria', e.target.value)} maxLength={5000} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Tags" optional error={errors.tags} hint="Comma separated, up to 8.">
                <Input value={view.tags} onChange={(e) => set('tags', e.target.value)} placeholder="react, css, bug" />
              </Field>
              <Field label="Links" optional error={errors.links} hint="One link per line, such as the issue.">
                <Textarea rows={2} value={view.links} onChange={(e) => set('links', e.target.value)} placeholder="https://github.com/org/repo/issues/42" />
              </Field>
            </div>
            <p className="text-sm text-mute">The text above is hashed and the hash is stored on-chain. After you post, it cannot be changed.</p>
          </fieldset>

          <fieldset className="space-y-5" disabled={locked}>
            <legend className="mb-4 font-display text-xl font-bold">Prize and deadline</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Prize pool (USDC)" error={errors.reward} hint="Total shared by all winners.">
                <Input inputMode="decimal" value={view.reward} onChange={(e) => set('reward', e.target.value)} placeholder="250" />
              </Field>
              <Field label="Submission deadline" error={errors.deadline} hint="Your local time.">
                <Input type="datetime-local" value={view.deadline} onChange={(e) => set('deadline', e.target.value)} />
              </Field>
            </div>
            <PrizeStructureEditor config={view.prize} onChange={(prize) => set('prize', prize)} reward={reward} />
            {errors.prize && <p className="text-sm font-medium text-danger">{errors.prize}</p>}
          </fieldset>
        </form>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Summary">
          <div className="space-y-5 rounded-md border-2 border-ink bg-white p-5 shadow-hard">
            <h2 className="font-display text-xl font-bold">Summary</h2>
            <FeeLedger lines={summaryLines} />
            {usdc.balance !== undefined && (
              <p className={`text-xs ${lowBalance ? 'font-bold text-danger' : 'text-mute'}`}>
                Your balance: <span className="num">{formatUsdc(usdc.balance, 4)} USDC</span>
              </p>
            )}
            <p className="text-xs text-mute">The 0.5% fee is not refunded if you later reclaim the prize.</p>

            <RequireIdentity purpose="post a bounty">
              <div className="space-y-4">
                {(running || created !== null) && (
                  <ol className="space-y-2 border-t border-line pt-4" aria-label="Progress">
                    {(Object.keys(STEP_LABELS) as StepKey[]).map((k) => (
                      <li key={k} className="flex items-center gap-2 text-sm">
                        <StepIcon state={steps[k]} />
                        <span className={steps[k] === 'todo' ? 'text-mute' : 'font-medium'}>{STEP_LABELS[k]}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {lowBalance && (
                  <Callout tone="warn" title="Not enough USDC">
                    <a className="font-bold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">
                      Get test USDC from the Circle faucet
                    </a>{' '}
                    and come back.
                  </Callout>
                )}
                {flowError && (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {flowError}
                  </p>
                )}

                <Button variant="primary" size="lg" className="w-full" loading={running} disabled={lowBalance} onClick={() => void start()}>
                  {created !== null ? `Continue (${stepCount} of 4 done)` : 'Create and fund bounty'}
                </Button>
                <p className="text-xs text-mute">Your wallet will ask you to confirm up to three transactions. Each one is a normal on-chain action.</p>
              </div>
            </RequireIdentity>
          </div>
        </aside>
      </div>
    </div>
  )
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done')
    return (
      <span aria-label="Done" className="grid size-5 place-items-center rounded-full border-2 border-ink bg-signal">
        <Check size={12} strokeWidth={3} aria-hidden />
      </span>
    )
  if (state === 'active') return <Spinner size={20} />
  if (state === 'error') return <CircleAlert size={20} aria-label="Failed" className="text-danger" />
  return <span aria-label="Waiting" className="size-5 rounded-full border-2 border-line" />
}
