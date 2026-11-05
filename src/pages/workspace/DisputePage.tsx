import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { RequireAccount } from '@/components/layout/RequireAccount'
import { DisputeView } from '@/features/bounty/DisputeThread'
import { PageHeader } from '@/components/ui/Feedback'

/** A dispute opened from a notification link. Parties and admins can read and reply. */
export default function DisputePage() {
  const { id } = useParams()
  return (
    <div className="max-w-3xl">
      <Link to="/submissions?tab=disputes" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-mute hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> All disputes
      </Link>
      <PageHeader title="Dispute" />
      <RequireAccount purpose="read this dispute">{id && <DisputeView id={id} />}</RequireAccount>
    </div>
  )
}
