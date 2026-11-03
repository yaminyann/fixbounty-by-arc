import { Link } from 'react-router-dom'
import { Bug } from 'lucide-react'
import { useAppConfig } from '@/lib/api/queries'
import { explorerAddress } from '@/lib/chain'
import { shortAddress } from '@/lib/money'

export function Footer() {
  const config = useAppConfig()
  const contract = config.data?.contractAddress

  return (
    <footer className="mt-20 border-t-2 border-ink bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.3fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid size-7 place-items-center rounded border-2 border-ink bg-signal">
              <Bug size={14} strokeWidth={2.5} aria-hidden />
            </span>
            FixBounty
          </p>
          <p className="max-w-xs text-sm text-mute">
            Prizes for open-source fixes, held in a smart contract until the maintainer picks the winners.
          </p>
          <p className="text-sm text-mute">
            Built by{' '}
            <a
              href="https://www.linkedin.com/in/yaminyann/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-ink underline decoration-2 underline-offset-2 hover:bg-signal"
            >
              Yamin
            </a>
          </p>
        </div>

        <nav aria-label="Footer" className="space-y-2 text-sm">
          <p className="font-bold">Product</p>
          <ul className="space-y-1.5 text-mute">
            <li><Link className="hover:text-ink hover:underline" to="/explore">Explore bounties</Link></li>
            <li><Link className="hover:text-ink hover:underline" to="/create">Post a bounty</Link></li>
            <li><Link className="hover:text-ink hover:underline" to="/activity">Activity</Link></li>
            <li><Link className="hover:text-ink hover:underline" to="/help">How it works and fees</Link></li>
          </ul>
        </nav>

        <div className="space-y-2 text-sm">
          <p className="font-bold">On-chain</p>
          <ul className="space-y-1.5 text-mute">
            <li>Network: Arc Testnet</li>
            <li>Test USDC has no real value</li>
            {contract && (
              <li>
                Contract{' '}
                <a
                  href={explorerAddress(contract)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="num text-ink underline underline-offset-2"
                >
                  {shortAddress(contract)}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </footer>
  )
}
