import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, ExternalLink } from 'lucide-react'
import { getRecentActivity, type ActivityEntry } from '@/lib/firestore'
import { apiGetActivity } from '@/lib/api'
import { explorerTx } from '@/lib/contract'
import { formatAddress } from '@/lib/bountyTypes'

const TYPE_LABELS: Record<ActivityEntry['type'], string> = {
  created: 'Bounty created',
  funded: 'Bounty funded',
  submitted: 'Work submitted',
  approved: 'Contributor approved',
  claimed: 'Reward claimed',
  refunded: 'Bounty refunded',
  cancelled: 'Bounty cancelled',
}

const TYPE_COLORS: Record<ActivityEntry['type'], string> = {
  created: 'bg-yellow-300',
  funded: 'bg-green-300',
  submitted: 'bg-blue-200',
  approved: 'bg-blue-400',
  claimed: 'bg-black text-white',
  refunded: 'bg-gray-200',
  cancelled: 'bg-gray-200 text-gray-400',
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      // 1. Query PostgreSQL API
      const apiRes = await apiGetActivity(40)
      const apiList = apiRes.activity
      if (apiList && apiList.length > 0) {
        setActivities(
          apiList.map((a) => ({
            id: a.id,
            bountyId: a.onchainId || 0,
            type: (a.action as ActivityEntry['type']) || 'created',
            actorAddress: a.actorWallet || '',
            message: a.description,
            txHash: a.txHash || undefined,
            timestamp: a.createdAt,
          }))
        )
      } else {
        // 2. Query Firestore fallback
        const fsList = await getRecentActivity(40)
        setActivities(fsList)
      }
    } catch {
      try {
        const fsList = await getRecentActivity(40)
        setActivities(fsList)
      } catch {
        setError(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, []) // initial load — load is a stable ref

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl tracking-tight">Activity</h1>
        <button onClick={() => { void load() }} className="border-2 border-black p-2 hover:bg-yellow-300 transition-colors" aria-label="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 border-2 border-gray-200 bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="border-2 border-black p-8 text-center bg-white">
          <p className="text-sm text-gray-500">
            Activity history is temporarily unavailable. See{' '}
            <Link to="/help" className="underline">help documentation</Link>.
          </p>
        </div>
      ) : activities.length === 0 ? (
        <div className="border-2 border-black p-10 text-center bg-white shadow-[4px_4px_0px_black]">
          <p className="font-bold mb-2">No activity yet</p>
          <p className="text-sm text-gray-500">Activity appears here as bounties are created and funded.</p>
        </div>
      ) : (
        <div className="border-2 border-black bg-white shadow-[4px_4px_0px_black]">
          {activities.map((a, i) => (
            <div key={i} className={`flex items-start gap-4 px-5 py-4 ${i < activities.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <span className={`px-2 py-0.5 text-xs font-bold border border-black shrink-0 ${TYPE_COLORS[a.type]}`}>
                {TYPE_LABELS[a.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{a.message}</p>
                {a.actorAddress && (
                  <p className="text-xs text-gray-400 mt-0.5">{formatAddress(a.actorAddress)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.txHash && (
                  <a href={explorerTx(a.txHash as `0x${string}`)} target="_blank" rel="noopener noreferrer"
                    className="text-gray-400 hover:text-black transition-colors">
                    <ExternalLink size={13} />
                  </a>
                )}
                <Link to={`/bounty/${a.bountyId}`}
                  className="text-xs font-medium border-2 border-black px-2 py-0.5 hover:bg-yellow-300 transition-colors">
                  #{a.bountyId}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
