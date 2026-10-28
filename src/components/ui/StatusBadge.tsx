import { BountyStatus, STATUS_LABELS, STATUS_COLORS } from '@/lib/bountyTypes'

interface StatusBadgeProps {
  status: BountyStatus
  className?: string
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-bold border border-black tracking-wide ${STATUS_COLORS[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
