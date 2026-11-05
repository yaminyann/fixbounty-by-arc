import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { useCategories, useMyProjects, useRecurringPrograms, type ListingInput } from '@/lib/api/ecosystem'
import type { Difficulty, WorkMode } from '@/lib/api/types'
import { splitTags } from '@/lib/metadata'

/** Form state for the listing details that sit beside a bounty. They are not part of the on-chain content hash. */
export interface ListingForm {
  category: string
  difficulty: '' | Difficulty
  skills: string
  workMode: WorkMode
  project: string
  program: string
  instructions: string
  eligibility: string
}

export const EMPTY_LISTING: ListingForm = {
  category: '',
  difficulty: '',
  skills: '',
  workMode: 'solo',
  project: '',
  program: '',
  instructions: '',
  eligibility: '',
}

export function toListingInput(form: ListingForm): ListingInput {
  return {
    category: form.category || null,
    difficulty: form.difficulty || null,
    skills: splitTags(form.skills).slice(0, 8),
    workMode: form.workMode,
    project: form.project || null,
    recurringProgramId: form.program || null,
    submissionInstructions: form.instructions.trim() || null,
    eligibility: form.eligibility.trim() || null,
  }
}

interface Props {
  value: ListingForm
  onChange: (next: ListingForm) => void
  disabled?: boolean
  /** Hide fields that make no sense once a bounty has started (team mode can still be changed before winners). */
  compact?: boolean
}

export function ListingFields({ value, onChange, disabled, compact }: Props) {
  const categories = useCategories()
  const projects = useMyProjects(true)
  const programs = useRecurringPrograms(value.project || undefined)
  const set = <K extends keyof ListingForm>(key: K, v: ListingForm[K]) => onChange({ ...value, [key]: v })
  const ownPrograms = (programs.data ?? []).filter((p) => p.active)

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" hint="Where contributors will find it.">
          <Select value={value.category} disabled={disabled} onChange={(e) => set('category', e.target.value)}>
            <option value="">Choose a category</option>
            {categories.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty" optional>
          <Select value={value.difficulty} disabled={disabled} onChange={(e) => set('difficulty', e.target.value as ListingForm['difficulty'])}>
            <option value="">Not specified</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </Field>
      </div>

      <Field label="Skills" optional hint="Comma separated, up to 8. Contributors filter by these.">
        <Input value={value.skills} disabled={disabled} onChange={(e) => set('skills', e.target.value)} placeholder="solidity, react, copywriting" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Work type" hint={value.workMode === 'team' ? 'Contributors can ask to join a team. Roles and splits are coordination only.' : 'One contributor per submission.'}>
          <Select value={value.workMode} disabled={disabled} onChange={(e) => set('workMode', e.target.value as WorkMode)}>
            <option value="solo">Solo contributors</option>
            <option value="team">Team bounty</option>
          </Select>
        </Field>
        <Field label="Project" optional hint={projects.data && projects.data.length === 0 ? 'You have no project yet. Create one under My projects.' : 'Show this bounty on a project page.'}>
          <Select value={value.project} disabled={disabled} onChange={(e) => onChange({ ...value, project: e.target.value, program: '' })}>
            <option value="">No project</option>
            {projects.data?.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {value.project && ownPrograms.length > 0 && (
        <Field label="Recurring program" optional hint="Publish this bounty as the next cycle of a program.">
          <Select value={value.program} disabled={disabled} onChange={(e) => set('program', e.target.value)}>
            <option value="">Not part of a program</option>
            {ownPrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {!compact && (
        <>
          <Field label="Submission instructions" optional hint="What contributors should send: links, files, a demo.">
            <Textarea rows={3} value={value.instructions} disabled={disabled} maxLength={2000} onChange={(e) => set('instructions', e.target.value)} />
          </Field>
          <Field label="Eligibility" optional hint="Who can take part, for example region, experience or tools.">
            <Textarea rows={2} value={value.eligibility} disabled={disabled} maxLength={1000} onChange={(e) => set('eligibility', e.target.value)} />
          </Field>
        </>
      )}
    </div>
  )
}
