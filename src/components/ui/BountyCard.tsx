import { Link } from 'react-router-dom'
import { Clock, DollarSign, User, Tag } from 'lucide-react'
import { type Bounty } from '@/lib/bountyTypes'
import { StatusBadge } from './StatusBadge'
import { formatAddress, timeUntil } from '@/lib/bountyTypes'

interface BountyCardProps {
  bounty: Bounty
  tags?: string[]
  categorySlug?: string
  imageUrl?: string
}

export function BountyCard({ bounty, tags = [], categorySlug, imageUrl }: BountyCardProps) {
  const cat = categorySlug || bounty.categorySlug

  return (
    <Link
      to={`/bounty/${bounty.id}`}
      className="block bg-white border-2 border-black shadow-[4px_4px_0px_black] hover:shadow-[6px_6px_0px_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all p-5 group flex flex-col justify-between"
    >
      <div>
        {imageUrl && (
          <div className="mb-3 border-2 border-black overflow-hidden h-32 bg-gray-100 flex items-center justify-center">
            <img
              src={imageUrl}
              alt={bounty.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                // Hide image if broken link
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-display font-bold text-base leading-snug group-hover:underline line-clamp-2">
            {bounty.title}
          </h3>
          <StatusBadge status={bounty.status} className="shrink-0 mt-0.5" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {cat && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-yellow-200 border border-black uppercase tracking-wider">
              <Tag size={10} />
              {cat.replace('-', ' ')}
            </span>
          )}

          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs font-medium bg-gray-100 border border-gray-300">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600 mt-auto pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1 font-bold text-black">
          <DollarSign size={14} strokeWidth={2.5} />
          {bounty.rewardFormatted} USDC
        </span>
        <span className="flex items-center gap-1">
          <Clock size={13} />
          {timeUntil(bounty.deadline)}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <User size={13} />
          {formatAddress(bounty.creator)}
        </span>
      </div>
    </Link>
  )
}
