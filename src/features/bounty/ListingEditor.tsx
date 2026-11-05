import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EMPTY_LISTING, ListingFields, toListingInput, type ListingForm } from '@/features/bounty/ListingFields'
import { errorMessage } from '@/lib/api/client'
import { useUpdateListing } from '@/lib/api/ecosystem'
import type { BountyDetail } from '@/lib/api/types'

function formFrom(bounty: BountyDetail): ListingForm {
  return {
    ...EMPTY_LISTING,
    category: bounty.category ?? '',
    difficulty: bounty.difficulty ?? '',
    skills: bounty.skills.join(', '),
    workMode: bounty.workMode,
    project: bounty.projectSlug ?? '',
    program: bounty.recurringProgramId ?? '',
    instructions: bounty.submissionInstructions ?? '',
    eligibility: bounty.eligibility ?? '',
  }
}

/** Lets the creator change how the bounty is listed. The hashed description and the prize stay as they are on-chain. */
export function ListingEditor({ bounty, onClose }: { bounty: BountyDetail; onClose: () => void }) {
  const update = useUpdateListing()
  const [form, setForm] = useState(() => formFrom(bounty))
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      await update.mutateAsync({ onchainId: bounty.onchainId, ...toListingInput(form) })
      toast.success('Listing details saved.')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Listing details"
      description="These help people find your bounty. They are stored on BountyFi and are not part of the on-chain text."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={update.isPending} onClick={() => void save()}>
            Save details
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ListingFields value={form} onChange={setForm} />
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
