import { BOUNTY_BOARD_ADDRESS, explorerAddr, TARGET_CHAIN } from '@/lib/contract'
import { ExternalLink, Shield, Info } from 'lucide-react'

export function Help() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="font-display font-bold text-2xl tracking-tight mb-2">Help & Security Notes</h1>
        <p className="text-sm text-gray-500">Everything you need to know about FixBounty and how it works onchain.</p>
      </div>

      {/* Network info */}
      <section id="network">
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400 mb-4">Network & Contract</h2>
        <div className="border-2 border-black bg-white p-5 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">Network</p>
              <p className="font-medium">{TARGET_CHAIN.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Chain ID</p>
              <p className="font-mono font-medium tabular-nums">{TARGET_CHAIN.chainId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">BountyBoard Contract</p>
              <a
                href={explorerAddr(BOUNTY_BOARD_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs hover:underline flex items-center gap-1"
              >
                {BOUNTY_BOARD_ADDRESS.slice(0, 10)}…{BOUNTY_BOARD_ADDRESS.slice(-8)}
                <ExternalLink size={11} />
              </a>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">USDC Token</p>
              <p className="font-mono text-xs">0x360000…0000 (6 decimals)</p>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 px-3 py-2 font-medium">
              This is a TESTNET deployment. All USDC used here has no real monetary value.
            </p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security">
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Shield size={14} />
          Security Model
        </h2>
        <div className="space-y-3">
          {[
            {
              title: 'Funds held in contract',
              body: 'When a creator funds a bounty, USDC is transferred to the BountyBoard contract. Neither the creator nor any platform admin can withdraw it freely — only the approved contributor can claim it, or the creator can refund it after the deadline.',
            },
            {
              title: 'No backdoor withdrawal',
              body: 'The contract has no owner, no admin key, and no emergency drain function. All state transitions are enforced by the contract code.',
            },
            {
              title: 'State machine protections',
              body: 'Each bounty follows a strict lifecycle: Open → Funded → Approved → Claimed. Double-claims, unauthorized approvals, and invalid transitions are rejected by the contract with custom errors.',
            },
            {
              title: 'Approval is final (with a grace-period escape)',
              body: 'Once a creator approves a contributor, the creator cannot undo it arbitrarily. However, if the approved contributor does not claim within 7 days after the deadline, the creator can recover the funds via refundAfterApproval.',
            },
            {
              title: 'Off-chain data is not authoritative',
              body: 'Descriptions, submission notes, and tags are stored in Firestore and PostgreSQL for display and indexing. The authoritative record of reward amounts, approval status, and claim status is always the blockchain.',
            },
            {
              title: 'Firebase identity vs. wallet ownership',
              body: 'Google sign-in proves app identity (Firebase UID). Wallet ownership is proven by the cryptographic wallet signature on each transaction. FixBounty never conflates the two.',
            },
          ].map(({ title, body }) => (
            <div key={title} className="border-2 border-black bg-white p-4">
              <p className="font-bold text-sm mb-1.5 flex items-center gap-2">
                <Shield size={13} className="text-green-600" />
                {title}
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How bounties work */}
      <section id="how-it-works">
        <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
          <Info size={14} />
          How Bounties Work
        </h2>
        <div className="border-2 border-black bg-white p-5 text-sm space-y-3 text-gray-700">
          <p><strong>Creating:</strong> Submit a title, description, reward, and deadline. The bounty is recorded onchain in Open status.</p>
          <p><strong>Funding:</strong> Approve USDC spending, then call fundBounty. USDC moves from your wallet to the contract. Status changes to Funded.</p>
          <p><strong>Submitting:</strong> Any connected wallet (except the creator) can submit work while the bounty is Funded and the deadline has not passed. A hash of your description is recorded onchain; your full description goes to the database.</p>
          <p><strong>Approving:</strong> The creator picks a submission. Only submissions with a recorded onchain hash can be approved. Status changes to Approved.</p>
          <p><strong>Claiming:</strong> The approved contributor calls claimReward. USDC transfers directly to their wallet. Status changes to Claimed.</p>
          <p><strong>Refunds:</strong> If the deadline passes with no approval, the creator can refund. If a contributor was approved but never claimed within 7 days after deadline, the creator can also recover funds.</p>
        </div>
      </section>
    </div>
  )
}
