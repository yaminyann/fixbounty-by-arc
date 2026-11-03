import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'

export default function NotFound() {
  return (
    <EmptyState
      title="There is nothing at this address"
      action={
        <ButtonLink to="/explore" variant="primary">
          Browse bounties
        </ButtonLink>
      }
    >
      The page may have moved, or the link may be mistyped.
    </EmptyState>
  )
}
