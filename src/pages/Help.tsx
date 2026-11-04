import { FeeLedger } from '@/components/bounty/FeeLedger'
import { AddressChip } from '@/components/ui/Address'
import { PageHeader } from '@/components/ui/Feedback'
import { useAppConfig } from '@/lib/api/queries'

function Rule({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-4 sm:grid-cols-[14rem_1fr] sm:gap-8">
      <dt className="font-display font-bold">{term}</dt>
      <dd className="max-w-2xl text-mute">{children}</dd>
    </div>
  )
}

export default function Help() {
  const config = useAppConfig()
  const c = config.data

  return (
    <div className="max-w-4xl">
      <PageHeader title="How BountyFi works">
        The rules the contract enforces and the review step the platform adds. Read this before you post or submit.
      </PageHeader>

      <section className="space-y-10">
        <div>
          <h2 className="mb-3 font-display text-2xl font-bold">Fees</h2>
          <p className="mb-4 max-w-2xl text-mute">
            There are two fees. Both are fixed in the contract and paid straight to the platform wallet, so you can verify them on the explorer.
          </p>
          <div className="max-w-md rounded-md border-2 border-ink bg-white p-5">
            <FeeLedger
              lines={[
                { label: 'Poster, when funding', value: '0.5% on top of the prize' },
                { label: 'Winner, when claiming', value: '5% of their payout' },
              ]}
            />
          </div>
          <p className="mt-3 max-w-2xl text-sm text-mute">
            The 0.5% fee is not refunded if the poster later takes the prize back. If a bounty has several winners, each pays 5% of their own share.
          </p>
        </div>

        <div>
          <h2 className="mb-3 font-display text-2xl font-bold">Rules</h2>
          <dl>
            <Rule term="Admin approval">
              Creating and funding a bounty puts it on-chain, but it only appears on the platform after an admin approves it. Until then only the creator and admins can open it. A bounty that is never approved stays on-chain and the creator can reclaim the prize.
            </Rule>
            <Rule term="Prize places">
              A bounty has one to ten prize places. The shares must add up to 100% and a lower place can never win more than a higher one. The creator may pick fewer winners than places, and the unused prizes go back to the creator when winners are approved.
            </Rule>
            <Rule term="Submitting">
              Each wallet can submit once per funded bounty, before the deadline. The text of the submission is hashed and the hash is recorded on-chain, so it cannot be changed after the fact.
            </Rule>
            <Rule term="Picking winners">
              The creator can pick winners at any time after the first submission. Picking is final and closes submissions.
            </Rule>
            <Rule term="Claiming">
              Winners have 7 days from approval to claim. After that the creator can take back anything unclaimed. Winners who already claimed keep their money.
            </Rule>
            <Rule term="Reclaiming">
              With no submissions, the creator can reclaim the prize as soon as the deadline passes. If anyone submitted, the creator must wait a further 7 days so every submission can be reviewed.
            </Rule>
            <Rule term="Account and wallet">
              Every action needs a Google account and a wallet linked together with a signed message. A wallet can belong to one account. The link is free and sends no transaction.
            </Rule>
          </dl>
        </div>

        <div>
          <h2 className="mb-3 font-display text-2xl font-bold">Trust and limits</h2>
          <ul className="max-w-2xl list-disc space-y-2 pl-5 text-mute">
            <li>The contract has no owner and no admin functions. Nobody, including the platform, can move escrowed funds.</li>
            <li>The contract has not had an independent audit. Use test funds only.</li>
            <li>The platform admin controls only what is listed on the website. The prize and the winners are decided on-chain.</li>
            <li>This runs on Arc Testnet. Test USDC has no real value. Get some from the <a className="font-bold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Circle faucet</a>.</li>
          </ul>
        </div>

        {c && (
          <div>
            <h2 className="mb-3 font-display text-2xl font-bold">Addresses</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <dt className="text-mute">Bounty contract</dt>
                <dd>{c.contractAddress ? <AddressChip address={c.contractAddress} /> : 'Not deployed yet'}</dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <dt className="text-mute">Platform fee wallet</dt>
                <dd><AddressChip address={c.treasuryAddress} /></dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <dt className="text-mute">USDC token</dt>
                <dd><AddressChip address={c.usdcAddress} /></dd>
              </div>
            </dl>
          </div>
        )}
      </section>
    </div>
  )
}
