import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Shield,
  Coins,
  Globe,
  CheckCircle2,
  Bug,
  CheckSquare,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Search,
  Tag,
  DollarSign,
  ArrowUpRight,
  FileCode,
  ShieldCheck,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { apiGetBounties, type ApiBounty } from '@/lib/api'
import { formatUsdcAmount, formatAddress, timeUntil } from '@/lib/bountyTypes'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { BOUNTY_BOARD_ADDRESS, ARC_EXPLORER_URL } from '@/lib/contract'

const PROTOCOL_FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Non-Custodial Escrow',
    desc: 'Bounty funds are locked into verified smart contracts before work begins. Maintainers cannot pull funds after work is accepted.',
  },
  {
    icon: Coins,
    title: 'USDC Native Settlement',
    desc: 'Rewards and gas are denominated strictly in USDC on Arc Testnet. Instant sub-second finality with zero price slippage.',
  },
  {
    icon: Globe,
    title: '100% Onchain Transparency',
    desc: 'Every bounty creation, escrow deposit, contributor solution, and reward claim is permanently auditable on the blockchain.',
  },
]

const HOW_IT_WORKS_STEPS = [
  {
    num: '01',
    title: 'Post Task & Lock Escrow',
    desc: 'Define task requirements, acceptance criteria, and USDC reward amount. Lock funds directly into the smart contract to open submissions.',
  },
  {
    num: '02',
    title: 'Contributors Build & Submit',
    desc: 'Developers, auditors, and creators complete work and submit pull requests, audit reports, or proof-of-work deliverables.',
  },
  {
    num: '03',
    title: 'Creator Verifies Solution',
    desc: 'The task creator reviews submissions against acceptance criteria and executes onchain approval for the winning contributor.',
  },
  {
    num: '04',
    title: 'Direct Instant Settlement',
    desc: 'Approved contributor calls the smart contract to claim 100% of the locked USDC directly into their connected Web3 wallet.',
  },
]

export function Landing() {
  const [liveBounties, setLiveBounties] = useState<ApiBounty[]>([])
  const [loadingBounties, setLoadingBounties] = useState(true)

  // Fetch real bounties from PostgreSQL
  useEffect(() => {
    let mounted = true
    apiGetBounties({ limit: 6 })
      .then((bounties) => {
        if (mounted) {
          // Prioritize funded or open bounties
          const sorted = [...bounties].sort((a, b) => {
            if (a.onchainStatus === 1 && b.onchainStatus !== 1) return -1
            if (b.onchainStatus === 1 && a.onchainStatus !== 1) return 1
            return (b.onchainId || 0) - (a.onchainId || 0)
          })
          setLiveBounties(sorted.slice(0, 6))
          setLoadingBounties(false)
        }
      })
      .catch(() => {
        if (mounted) setLoadingBounties(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="space-y-20 md:space-y-24">
      {/* 1. Homepage Hero Section (2-Column Balanced Neo-Brutalist Layout) */}
      <section className="pt-4 sm:pt-8 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Headline, Value Proposition & CTAs */}
          <div className="lg:col-span-7 space-y-6">
            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="font-display font-black text-4xl sm:text-5xl lg:text-6xl leading-[1.06] tracking-tight text-balance text-black"
            >
              Complete tasks, earn USDC. <br />
              <span className="bg-yellow-300 px-2 py-0.5 border-2 border-black inline-block mt-1 shadow-[4px_4px_0px_black]">
                Guaranteed onchain.
              </span>
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-base sm:text-lg text-gray-700 max-w-xl leading-relaxed text-pretty font-medium"
            >
              The decentralized task and bounty marketplace on Arc. Fund development tasks, smart contract audits, bug fixes, and crypto deliverables in non-custodial USDC escrow. Contributors submit verified work and receive guaranteed payouts upon review approval.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex flex-wrap items-center gap-3 pt-2"
            >
              <Link
                to="/explore"
                className="inline-flex items-center gap-2 bg-black text-white border-2 border-black px-6 py-3.5 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all shadow-[4px_4px_0px_#EAB308] hover:shadow-[4px_4px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
              >
                <span>Browse Open Tasks</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/create"
                className="inline-flex items-center gap-2 bg-white text-black border-2 border-black px-6 py-3.5 font-bold text-sm hover:bg-yellow-300 transition-all shadow-[4px_4px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
              >
                <span>Post a Task</span>
              </Link>
              <a
                href={`${ARC_EXPLORER_URL}/address/${BOUNTY_BOARD_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-gray-600 hover:text-black px-3 py-2 transition-colors ml-auto sm:ml-0"
              >
                <span>Contract {BOUNTY_BOARD_ADDRESS.slice(0, 6)}…{BOUNTY_BOARD_ADDRESS.slice(-4)}</span>
                <ArrowUpRight size={14} />
              </a>
            </motion.div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-6 border-t-2 border-black">
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Settlement Engine</div>
                <div className="font-display font-black text-base sm:text-lg text-black mt-0.5">Arc Testnet</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Platform Protocol Fee</div>
                <div className="font-display font-black text-base sm:text-lg text-green-700 mt-0.5">0% (V1 Escrow)</div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Escrow Security</div>
                <div className="font-display font-black text-base sm:text-lg text-black mt-0.5">SafeERC20 Audited</div>
              </div>
            </div>
          </div>

          {/* Right Column: Task & Escrow Illustration */}
          <div className="lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative group border-2 border-black bg-white shadow-[8px_8px_0px_black] overflow-hidden"
            >
              {/* Window Header */}
              <div className="bg-yellow-300 border-b-2 border-black px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-black rounded-full" />
                  <span className="font-mono text-xs font-bold text-black uppercase tracking-wider">
                    TaskFi Escrow
                  </span>
                </div>
                <span className="text-[11px] font-mono text-black font-bold">
                  SafeERC20
                </span>
              </div>

              {/* Related Graphic Image */}
              <div className="relative aspect-[4/3] w-full bg-[#0B0F19] overflow-hidden">
                <img
                  src="/hero-bounty.jpg"
                  alt="TaskFi Decentralized Task and Bounty Escrow Platform"
                  className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-500 ease-out"
                  loading="eager"
                />
              </div>

              {/* Bottom Caption Bar */}
              <div className="bg-white border-t-2 border-black p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 shrink-0 bg-black text-yellow-300 border-2 border-black flex items-center justify-center font-bold text-xs shadow-[2px_2px_0px_black]">
                    <CheckSquare size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-black font-display leading-tight truncate">
                      Task & Bounty Escrow Protocol
                    </div>
                    <div className="text-[10px] font-mono text-gray-600 truncate">
                      Non-Custodial Smart Contract Escrow
                    </div>
                  </div>
                </div>
                <Link
                  to="/explore"
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-bold font-mono bg-yellow-300 hover:bg-black hover:text-white px-3 py-1.5 border-2 border-black transition-colors shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
                >
                  <span>Explore</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 2. Live Tasks & Bounties Section (Real PostgreSQL Data) */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b-2 border-black pb-5">
          <div>
            <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-black">
              Live Tasks & Bounties
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Active crypto tasks and bounties with verified USDC locked in smart contract escrow.
            </p>
          </div>
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold border-2 border-black px-4 py-2 bg-yellow-300 hover:bg-black hover:text-white shadow-[2px_2px_0px_black] active:translate-x-0.5 active:translate-y-0.5 transition-all self-start sm:self-auto shrink-0 uppercase tracking-wider"
          >
            <span>Explore All Tasks</span>
            <ChevronRight size={16} />
          </Link>
        </div>

        {/* Loading Skeletons */}
        {loadingBounties ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black] animate-pulse space-y-4"
              >
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-gray-200 w-16" />
                  <div className="h-4 bg-gray-200 w-20" />
                </div>
                <div className="h-6 bg-gray-200 w-3/4" />
                <div className="h-12 bg-gray-100 w-full" />
                <div className="h-4 bg-gray-200 w-1/3 pt-3 border-t border-gray-100" />
              </div>
            ))}
          </div>
        ) : liveBounties.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveBounties.map((b) => (
              <Link
                key={b.id}
                to={`/bounty/${b.onchainId || b.id}`}
                className="group border-2 border-black bg-white p-5 shadow-[4px_4px_0px_black] hover:shadow-[6px_6px_0px_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all flex flex-col justify-between"
              >
                <div>
                  {b.imageUrl && (
                    <div className="mb-3 border-2 border-black overflow-hidden h-32 bg-gray-100">
                      <img
                        src={b.imageUrl}
                        alt={b.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          ;(e.target as HTMLElement).style.display = 'none'
                        }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[11px] font-mono font-black bg-yellow-300 border border-black px-2 py-0.5 shadow-[1px_1px_0px_black]">
                      #{b.onchainId || '1'}
                    </span>
                    <StatusBadge status={b.onchainStatus} />
                  </div>

                  <h3 className="font-display font-bold text-base leading-snug group-hover:underline line-clamp-2 mb-2 text-black">
                    {b.title}
                  </h3>

                  <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-4">
                    {b.description}
                  </p>

                  {b.tags && b.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {b.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t-2 border-black flex items-center justify-between text-xs">
                  <div className="font-display font-black text-sm text-black flex items-center gap-0.5">
                    <DollarSign size={14} />
                    <span>{formatUsdcAmount(b.rewardAmount)}</span>
                    <span className="text-[10px] text-gray-500 font-normal ml-0.5">USDC</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500 font-mono text-[11px]">
                    <Clock size={12} />
                    <span>{b.deadline ? timeUntil(new Date(b.deadline)) : '14d left'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-black p-10 text-center bg-white shadow-[4px_4px_0px_black] space-y-3">
            <p className="text-sm font-bold text-gray-700">No active bounties available right now.</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Be the first repository maintainer to post an issue and fund escrow on Arc Testnet.
            </p>
            <Link
              to="/create"
              className="inline-flex items-center gap-1.5 bg-yellow-300 border-2 border-black px-4 py-2 text-xs font-bold hover:bg-black hover:text-white transition-colors"
            >
              Post a Task &rarr;
            </Link>
          </div>
        )}
      </section>

      {/* 3. Why TaskFi on Arc Protocol */}
      <section className="space-y-6">
        <div>
          <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-black mb-2">
            Why TaskFi on Arc?
          </h2>
          <p className="text-sm text-gray-600 max-w-2xl leading-relaxed">
            Traditional freelance and bounty platforms lock funds behind opaque review gates, charge high platform fees, and take weeks
            to disburse payouts. TaskFi provides deterministic, automated settlement.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROTOCOL_FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="border-2 border-black p-6 bg-white shadow-[4px_4px_0px_black] hover:shadow-[6px_6px_0px_black] transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 border-2 border-black bg-yellow-300 flex items-center justify-center mb-4 shadow-[2px_2px_0px_black]">
                  <Icon size={22} className="text-black" />
                </div>
                <h3 className="font-display font-bold text-lg mb-2 text-black">{title}</h3>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. How It Works Flow */}
      <section className="space-y-6">
        <div>
          <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-black mb-2">
            How It Works
          </h2>
          <p className="text-sm text-gray-600 max-w-xl leading-relaxed">
            Projects fund tasks with USDC escrow, contributors deliver verified work, and payouts settle onchain upon review approval.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IT_WORKS_STEPS.map(({ num, title, desc }) => (
            <div
              key={num}
              className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] flex flex-col justify-between"
            >
              <div>
                <div className="font-mono font-black text-3xl text-yellow-500 mb-3 tracking-tight">
                  {num}
                </div>
                <h3 className="font-display font-bold text-base mb-2 text-black">{title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Security & Verification Architecture */}
      <section className="border-2 border-black bg-black text-white p-7 sm:p-9 shadow-[8px_8px_0px_#EAB308]">
        <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
          <div className="w-14 h-14 bg-yellow-300 border-2 border-white flex items-center justify-center shrink-0 shadow-[3px_3px_0px_white]">
            <Shield size={28} className="text-black" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-white">
              Deterministic Escrow & Contributor Protections
            </h2>
            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-3xl">
              TaskFi removes counterparty risk by locking USDC rewards directly into audited smart contracts on Arc
              before any work begins. Once a task is completed and approved by the creator, payment release is guaranteed programmatically.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-6 border-t border-gray-800">
          {[
            'Non-Custodial Smart Contract Escrow',
            'Zero Intermediary Withholding Risk',
            'Autonomous Onchain Payout Verification',
            'Audited Reentrancy & SafeERC20 Logic',
            'Programmatic 7-Day Refund Grace Period',
            'Sub-Second Finality on Arc Testnet',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-200">
              <CheckCircle2 size={16} className="text-yellow-300 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Call to Action Banner */}
      <section className="border-2 border-black bg-yellow-300 p-8 sm:p-12 text-center shadow-[6px_6px_0px_black] space-y-4">
        <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-black">
          Ready to post or complete your first task?
        </h2>
        <p className="text-sm sm:text-base text-gray-800 max-w-lg mx-auto leading-relaxed">
          Connect your Web3 wallet and get started on Arc Testnet in seconds. Testnet USDC is available via the community faucet.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 bg-black text-white border-2 border-black px-8 py-3.5 font-bold text-sm hover:bg-white hover:text-black transition-all shadow-[4px_4px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          >
            <span>Explore Tasks</span>
            <ArrowRight size={16} />
          </Link>
          <Link
            to="/create"
            className="inline-flex items-center gap-2 bg-white text-black border-2 border-black px-8 py-3.5 font-bold text-sm hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_black] active:translate-x-0.5 active:translate-y-0.5"
          >
            <span>Post a Task</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
