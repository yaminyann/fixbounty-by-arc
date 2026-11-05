import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RequireAccount } from '@/components/layout/RequireAccount'
import { AddressChip, Avatar } from '@/components/ui/Address'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/Confirm'
import { Callout, PageHeader, Section, Skeleton } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { useAuth } from '@/contexts/AuthContext'
import { useIdentity } from '@/contexts/IdentityContext'
import { errorMessage } from '@/lib/api/client'
import { useMyProfile, useSaveProfile } from '@/lib/api/ecosystem'
import { useEncryption } from '@/features/bounty/useEncryption'
import { formatDate } from '@/lib/time'
import { splitTags } from '@/lib/metadata'

type ProfileValues = { displayName: string; bio: string; skills: string; websiteUrl: string; githubUrl: string; avatarUrl: string }

function ProfileForm() {
  const query = useMyProfile(true)
  if (query.isPending) return <Skeleton className="h-64 w-full" />
  const p = query.data
  const initial: ProfileValues = {
    displayName: p?.displayName ?? '',
    bio: p?.bio ?? '',
    skills: p?.skills.join(', ') ?? '',
    websiteUrl: p?.websiteUrl ?? '',
    githubUrl: p?.githubUrl ?? '',
    avatarUrl: p?.avatarUrl ?? '',
  }
  return <ProfileFields initial={initial} />
}

function ProfileFields({ initial }: { initial: ProfileValues }) {
  const save = useSaveProfile()
  const id = useIdentity()
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (patch: Partial<ProfileValues>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async () => {
    const next: Record<string, string> = {}
    for (const key of ['websiteUrl', 'githubUrl', 'avatarUrl'] as const) {
      if (form[key] && !/^https?:\/\/\S+$/i.test(form[key])) next[key] = 'Enter a full link starting with https://'
    }
    const skills = splitTags(form.skills)
    if (skills.length > 12) next.skills = 'Up to 12 skills.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      await save.mutateAsync({ ...form, skills })
      toast.success('Profile saved.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form
      className="max-w-xl space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Display name" optional hint="Shown on your public profile and next to your submissions. Defaults to your Google name.">
        <Input value={form.displayName} maxLength={60} onChange={(e) => set({ displayName: e.target.value })} />
      </Field>
      <Field label="About you" optional>
        <Textarea rows={4} value={form.bio} maxLength={500} onChange={(e) => set({ bio: e.target.value })} />
      </Field>
      <Field label="Skills" optional error={errors.skills} hint="Comma separated, up to 12.">
        <Input value={form.skills} onChange={(e) => set({ skills: e.target.value })} placeholder="solidity, react, technical writing" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Website" optional error={errors.websiteUrl}>
          <Input type="url" value={form.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="GitHub" optional error={errors.githubUrl}>
          <Input type="url" value={form.githubUrl} onChange={(e) => set({ githubUrl: e.target.value })} placeholder="https://github.com/you" />
        </Field>
      </div>
      <Field label="Avatar link" optional error={errors.avatarUrl} hint="A link to a square image. Leave empty to use your Google photo.">
        <Input type="url" value={form.avatarUrl} onChange={(e) => set({ avatarUrl: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save profile
        </Button>
        {id.linkedWallet && (
          <Link to={`/u/${id.linkedWallet.toLowerCase()}`} className="text-sm font-medium underline underline-offset-2">
            View public profile
          </Link>
        )}
      </div>
      <p className="text-xs text-mute">Your e-mail address is never shown. Your profile also lists your wallet, the work you submitted and rewards read from the blockchain.</p>
    </form>
  )
}

function EncryptionSection() {
  const id = useIdentity()
  const encryption = useEncryption(true)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setError(null)
    try {
      await encryption.setup()
      toast.success('Encryption key created.')
    } catch (err) {
      const message = errorMessage(err)
      setError(/reject|denied/i.test(message) ? 'You declined the signature request. Nothing was changed.' : message)
    }
  }

  if (encryption.loading) return <Skeleton className="h-24 w-full" />
  if (encryption.key) {
    return (
      <Callout tone="ok" title="Your encryption key is set">
        Created {formatDate(encryption.key.createdAt)}. It is unlocked with a signature from this wallet, so keep using the same wallet. Reports encrypted to this key cannot be read without it, and the key cannot be replaced.
      </Callout>
    )
  }
  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-mute">
        Needed only if you want to accept confidential security reports. Your browser creates a key pair; the private half is locked with a signature from your wallet before it is stored, so BountyFi never sees it. You sign twice to prove the key can always be unlocked again.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" loading={encryption.busy} disabled={id.status !== 'ready'} onClick={() => void create()}>
        Create encryption key
      </Button>
      {id.status !== 'ready' && <p className="text-xs text-mute">Connect and link your wallet first.</p>}
    </div>
  )
}

function Content() {
  const { user, signOut } = useAuth()
  const id = useIdentity()
  const { confirm, dialog } = useConfirm()

  const unlink = async () => {
    const ok = await confirm({
      title: 'Unlink this wallet?',
      description: 'You will not be able to post, submit or claim from this account until you link a wallet again. Your history stays with the wallet address.',
      confirmLabel: 'Unlink wallet',
      danger: true,
    })
    if (!ok) return
    await id.unlinkWallet()
    toast.success('Wallet unlinked.')
  }

  return (
    <div className="space-y-10">
      <Section title="Profile" description="What other people see about you.">
        <ProfileForm />
      </Section>

      <div id="encryption" className="scroll-mt-24">
        <Section title="Encryption key" description="For confidential security reports.">
          <EncryptionSection />
        </Section>
      </div>

      <Section title="Google account">
        {user && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.displayName ?? user.email} src={user.photoURL} size={44} />
              <div>
                <p className="font-medium">{user.displayName ?? 'Signed in'}</p>
                <p className="text-sm text-mute">{user.email}</p>
              </div>
            </div>
            <Button variant="danger" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        )}
      </Section>

      <Section title="Wallet" description="The wallet linked to your account signs every transaction.">
        <dl className="max-w-xl space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-mute">Connected</dt>
            <dd>{id.address ? <AddressChip address={id.address} /> : 'No wallet connected'}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-mute">Linked to your account</dt>
            <dd>{id.linkedWallet ? <AddressChip address={id.linkedWallet} /> : 'Nothing linked yet'}</dd>
          </div>
        </dl>

        {id.status === 'ready' && <Callout tone="ok">Your wallet and Google account are linked. You can post, submit and claim.</Callout>}
        {id.status === 'wallet_mismatch' && (
          <Callout tone="warn" title="The connected wallet is not the linked one">
            Switch to the linked wallet in your wallet app, or link the connected wallet to replace it.
          </Callout>
        )}
        {id.error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {id.error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!id.address && (
            <Button variant="primary" onClick={id.connectWallet}>
              Connect wallet
            </Button>
          )}
          {id.address && user && (id.status === 'needs_link' || id.status === 'wallet_mismatch') && (
            <Button variant="primary" loading={id.busy} onClick={() => void id.linkWallet()}>
              {id.status === 'wallet_mismatch' ? 'Link connected wallet instead' : 'Sign and link wallet'}
            </Button>
          )}
          {id.address && <Button onClick={id.disconnectWallet}>Disconnect wallet</Button>}
          {id.linkedWallet && (
            <Button variant="danger" loading={id.busy} onClick={() => void unlink()}>
              Unlink wallet
            </Button>
          )}
        </div>
        <p className="text-xs text-mute">A wallet can belong to one account. Linking asks for a free signature and never sends a transaction.</p>
      </Section>
      {dialog}
    </div>
  )
}

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings and wallet">Your profile, Google account and linked wallet.</PageHeader>
      <RequireAccount purpose="change your settings">
        <Content />
      </RequireAccount>
    </div>
  )
}
