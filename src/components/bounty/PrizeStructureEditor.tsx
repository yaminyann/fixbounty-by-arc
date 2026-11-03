import { Field, Input, Select } from '@/components/ui/Form'
import { Segmented } from '@/components/ui/Tabs'
import { Callout } from '@/components/ui/Feedback'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { computePayouts } from '@/lib/money'
import {
  MAX_WINNERS,
  SHARE_PROBLEM_TEXT,
  bpsToPercent,
  customStarter,
  equalShares,
  resolveShares,
  validateShares,
  customFromShares,
  type PrizeConfig,
  type PrizeMode,
} from '@/lib/prize'

interface Props {
  config: PrizeConfig
  onChange: (next: PrizeConfig) => void
  /** Prize pool in USDC base units, used to preview each position's payout. */
  reward: bigint | null
}

export function PrizeStructureEditor({ config, onChange, reward }: Props) {
  const shares = resolveShares(config)
  const problem = shares ? validateShares(shares) : null
  const total = config.custom.slice(0, config.count).reduce((sum, v) => sum + (Number(v) || 0), 0)

  const setMode = (mode: PrizeMode) => {
    if (mode === 'single') onChange({ mode, count: 1, custom: ['100'] })
    else if (mode === 'equal') onChange({ mode, count: Math.max(config.count, 2), custom: customFromShares(equalShares(Math.max(config.count, 2))) })
    else {
      const count = Math.max(config.count, 3)
      onChange({ mode, count, custom: customFromShares(customStarter(count)) })
    }
  }

  const setCount = (count: number) => {
    onChange({ ...config, count, custom: customFromShares(config.mode === 'custom' ? customStarter(count) : equalShares(count)) })
  }

  const payouts = shares && !problem && reward ? computePayouts(reward, shares) : undefined

  return (
    <fieldset className="space-y-5">
      <legend className="mb-1 text-sm font-bold">How the prize is shared</legend>

      <Segmented
        label="Prize structure"
        value={config.mode}
        onChange={setMode}
        items={[
          { value: 'single', label: 'One winner' },
          { value: 'equal', label: 'Equal split' },
          { value: 'custom', label: 'Ranked split' },
        ]}
      />

      {config.mode !== 'single' && (
        <Field label="Number of winners" hint={`Between 2 and ${MAX_WINNERS}.`} className="max-w-xs">
          <Select value={config.count} onChange={(e) => setCount(Number(e.target.value))}>
            {Array.from({ length: MAX_WINNERS - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} winners
              </option>
            ))}
          </Select>
        </Field>
      )}

      {config.mode === 'custom' && (
        <div className="space-y-3">
          <p className="text-sm text-mute">Set each place as a percentage. A lower place cannot win more than a higher one.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {config.custom.slice(0, config.count).map((value, i) => (
              <Field key={i} label={`${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} place (%)`}>
                <Input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => {
                    const custom = [...config.custom]
                    custom[i] = e.target.value
                    onChange({ ...config, custom })
                  }}
                />
              </Field>
            ))}
          </div>
          <p className={`num text-sm font-bold ${Math.round(total * 100) === 10_000 ? 'text-ok' : 'text-danger'}`}>Total: {bpsToPercent(Math.round(total * 100))}%</p>
        </div>
      )}

      {problem && <Callout tone="warn">{SHARE_PROBLEM_TEXT[problem]}</Callout>}
      {!shares && config.mode === 'custom' && <Callout tone="warn">Use numbers like 50 or 33.33 for each place.</Callout>}

      {shares && !problem && (
        <div className="rounded-md border border-line bg-paper p-4">
          <PrizeLadder shares={shares} payouts={payouts} />
        </div>
      )}

      {config.mode !== 'single' && (
        <p className="text-sm text-mute">
          When you pick winners you can choose fewer people than places. Any unused place is returned to you in the same transaction.
        </p>
      )}
    </fieldset>
  )
}
