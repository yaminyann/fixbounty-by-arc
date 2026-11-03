import { useState } from 'react'
import { Field, Input } from '@/components/ui/Form'
import { Segmented } from '@/components/ui/Tabs'
import { FeeLedger } from '@/components/bounty/FeeLedger'
import { PrizeLadder } from '@/components/bounty/PrizeLadder'
import { claimFee, computePayouts, formatUsdc, parseUsdc, postFee } from '@/lib/money'

const STRUCTURES = {
  one: { label: 'One winner', shares: [10_000] },
  podium: { label: '50 / 30 / 20', shares: [5_000, 3_000, 2_000] },
  four: { label: '4 equal', shares: [2_500, 2_500, 2_500, 2_500] },
} as const

type Key = keyof typeof STRUCTURES

/** Works out exactly what the poster pays and what each place receives, using the real fee rates. */
export function PrizeCalculator() {
  const [amount, setAmount] = useState('500')
  const [key, setKey] = useState<Key>('podium')
  const reward = parseUsdc(amount)
  const shares = STRUCTURES[key].shares as unknown as number[]
  const payouts = reward ? computePayouts(reward, shares) : null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-end">
        <Field label="Prize pool (USDC)" error={amount && !reward ? 'Enter an amount like 250 or 99.50' : null}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Segmented
          label="Prize structure"
          value={key}
          onChange={setKey}
          items={(Object.keys(STRUCTURES) as Key[]).map((k) => ({ value: k, label: STRUCTURES[k].label }))}
        />
      </div>

      {reward && payouts ? (
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-3 font-display text-lg font-bold">The poster pays</h3>
            <FeeLedger
              lines={[
                { label: 'Prize pool, held in escrow', value: `${formatUsdc(reward)} USDC` },
                { label: 'Platform fee, 0.5%', value: `${formatUsdc(postFee(reward), 4)} USDC` },
                { label: 'Total from the poster', value: `${formatUsdc(reward + postFee(reward), 4)} USDC`, total: true },
              ]}
            />
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-bold">Each winner receives</h3>
            <FeeLedger
              lines={payouts.map((gross, i) => ({
                label: `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} place, after 5% fee`,
                value: `${formatUsdc(gross - claimFee(gross), 4)} USDC`,
              }))}
            />
          </div>
          <div className="md:col-span-2">
            <PrizeLadder shares={shares} payouts={payouts} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-mute">Enter a prize pool to see the breakdown.</p>
      )}
    </div>
  )
}
