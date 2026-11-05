import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAppConfig } from '@/lib/api/queries'
import { appChain, explorerAddress } from '@/lib/chain'
import { shortAddress } from '@/lib/money'

const YEAR = new Date().getFullYear()

const LINK = 'text-sm text-white/70 underline-offset-4 hover:text-white hover:underline'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title} className="space-y-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="space-y-2.5">{children}</ul>
    </nav>
  )
}

function ExternalItem({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
        {children}
      </a>
    </li>
  )
}

export function Footer() {
  const config = useAppConfig()
  const contract = config.data?.contractAddress
  const treasury = config.data?.treasuryAddress

  return (
    <footer className="on-ink mt-24 bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-14">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-5">
            <Link to="/" aria-label="BountyFi home" className="inline-block">
              <img src="/brand/lockup.png" alt="BountyFi" width={760} height={186} className="h-auto w-52" />
            </Link>
            <p className="max-w-xs text-sm text-white/70">
              Turn any problem into a reward. Prizes stay in a smart contract until the creator picks the winners.
            </p>
            <p className="text-sm font-semibold">
              <a href="https://bountyfi.xyz" className="text-signal underline-offset-4 hover:underline">
                bountyfi.xyz
              </a>
            </p>
          </div>

          <Column title="Discover">
            <li>
              <Link className={LINK} to="/explore">
                Explore bounties
              </Link>
            </li>
            <li>
              <Link className={LINK} to="/categories">
                Categories
              </Link>
            </li>
            <li>
              <Link className={LINK} to="/projects">
                Projects
              </Link>
            </li>
            <li>
              <Link className={LINK} to="/activity">
                Activity
              </Link>
            </li>
          </Column>

          <Column title="Build">
            <li>
              <Link className={LINK} to="/create">
                Post a bounty
              </Link>
            </li>
            <li>
              <Link className={LINK} to="/dashboard">
                Workspace
              </Link>
            </li>
            <li>
              <Link className={LINK} to="/help">
                How it works
              </Link>
            </li>
            <ExternalItem href="https://faucet.circle.com">Get test USDC</ExternalItem>
          </Column>

          <Column title="On-chain">
            <li className="text-sm text-white/70">Network: {appChain.name}</li>
            {contract && <ExternalItem href={explorerAddress(contract)}>Contract {shortAddress(contract)}</ExternalItem>}
            {treasury && <ExternalItem href={explorerAddress(treasury)}>Fee wallet {shortAddress(treasury)}</ExternalItem>}
          </Column>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-white/60">
          <p>© {YEAR} BountyFi. All rights reserved.</p>
          <p>{appChain.testnet ? 'Test USDC on Arc Testnet has no real value.' : 'Transactions are final and settle on-chain.'}</p>
        </div>
      </div>
    </footer>
  )
}
