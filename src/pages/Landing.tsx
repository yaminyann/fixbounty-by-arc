import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Zap, Globe, CheckCircle2, Bug } from 'lucide-react'

const FEATURES = [
  {
    icon: Globe,
    title: 'Public & Verifiable',
    desc: 'Every bounty, funding event, approval, and payout is recorded on Arc Testnet. Anyone can verify the full history.',
  },
  {
    icon: Shield,
    title: 'Smart Contract Enforced',
    desc: 'Reward funds are held by the contract, not a third party. Creators cannot redirect funds after approving a contributor.',
  },
  {
    icon: Zap,
    title: 'USDC Rewards',
    desc: 'Rewards are denominated in USDC on Arc — stable value, no gas token confusion, fast settlement.',
  },
]

const STEPS = [
  { num: '01', title: 'Post a Bounty', desc: 'Describe the task, set a USDC reward, and specify a deadline and acceptance criteria.' },
  { num: '02', title: 'Fund It', desc: 'Lock the USDC reward into the smart contract. Contributors can see it is real.' },
  { num: '03', title: 'Review Submissions', desc: 'Contributors submit links and hashes of their work. Pick the one that meets your criteria.' },
  { num: '04', title: 'Payout', desc: 'Approve a submission and the contributor claims their USDC directly from the contract.' },
]

export function Landing() {
  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="pt-8 pb-4">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 border-2 border-black bg-yellow-300 px-3 py-1 text-xs font-bold tracking-widest mb-6">
            <span className="w-2 h-2 bg-black rounded-full animate-pulse" />
            LIVE ON ARC TESTNET
          </div>
          <h1 className="font-display font-bold text-4xl md:text-5xl leading-tight tracking-tight mb-4 text-balance">
            Coordinate open-source work with verifiable USDC rewards.
          </h1>
          <p className="text-lg text-gray-600 mb-8 text-pretty max-w-xl">
            FixBounty lets open-source maintainers post bug fix bounties and pay contributors directly via smart contract — no middleman, no trust required.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 bg-black text-white border-2 border-black px-6 py-3 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[4px_4px_0px_black]"
            >
              Browse Bounties
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 bg-white border-2 border-black px-6 py-3 font-bold text-sm hover:bg-yellow-300 transition-all shadow-[4px_4px_0px_black]"
            >
              Post a Bounty
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="font-display font-bold text-2xl mb-8 tracking-tight">Why onchain bounties?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="border-2 border-black p-6 bg-white shadow-[4px_4px_0px_black]">
              <div className="w-10 h-10 border-2 border-black bg-yellow-300 flex items-center justify-center mb-4">
                <Icon size={20} />
              </div>
              <h3 className="font-bold text-base mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="font-display font-bold text-2xl mb-8 tracking-tight">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border-2 border-black">
          {STEPS.map(({ num, title, desc }, i) => (
            <div
              key={num}
              className={`p-6 bg-white ${i < STEPS.length - 1 ? 'border-b-2 lg:border-b-0 lg:border-r-2 border-black' : ''}`}
            >
              <div className="font-display font-bold text-4xl text-gray-200 mb-3 tabular-nums">{num}</div>
              <h3 className="font-bold text-base mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust section */}
      <section className="border-2 border-black bg-black text-white p-8 shadow-[8px_8px_0px_#EAB308]">
        <div className="flex items-start gap-4 mb-6">
          <Bug size={28} className="shrink-0 mt-1 text-yellow-300" />
          <div>
            <h2 className="font-display font-bold text-2xl tracking-tight mb-2">Built for trust, not trust-me.</h2>
            <p className="text-gray-300 text-sm leading-relaxed max-w-2xl">
              Reward funds are locked in the smart contract before work begins. The contract enforces all rules: only approved contributors can claim, only creators can approve, and unclaimed bounties can be refunded after the deadline. No admin keys, no withdrawal backdoors.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            'Funds locked in contract',
            'No admin withdrawal',
            'Open source contract',
            'Verifiable on explorer',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircle2 size={14} className="text-yellow-300 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center pb-8">
        <h2 className="font-display font-bold text-2xl mb-3">Ready to get started?</h2>
        <p className="text-gray-600 mb-6 text-sm">Connect your wallet and get test USDC from the faucet in the sidebar.</p>
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 bg-yellow-300 border-2 border-black px-8 py-3 font-bold text-sm hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_black]"
        >
          Explore Bounties
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  )
}
