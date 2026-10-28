import { useState, useEffect } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Github, ExternalLink, ShieldCheck, CheckCircle2, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getUserProfile, upsertUserProfile, type UserProfile } from '@/lib/firestore'
import { apiGetMe, apiGetWalletChallenge, apiLinkWallet, type ApiWallet } from '@/lib/api'
import { formatAddress } from '@/lib/bountyTypes'
import { explorerAddr } from '@/lib/contract'

export function Profile() {
  const { user, loading, signInWithGoogle } = useAuth()
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [profile, setProfile] = useState<Partial<UserProfile>>({})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ bio: '', github: '' })

  const [linkedWallets, setLinkedWallets] = useState<ApiWallet[]>([])
  const [linkingWallet, setLinkingWallet] = useState(false)

  const reloadProfileAndWallets = async () => {
    if (!user) return
    try {
      const meData = await apiGetMe()
      if (meData?.wallets) {
        setLinkedWallets(meData.wallets)
      }
      const p = await getUserProfile(user.uid)
      if (p) {
        setProfile(p)
        setForm({ bio: p.bio ?? '', github: p.github ?? '' })
      }
    } catch (err) {
      console.warn('[Profile] Failed to load data:', err)
    }
  }

  useEffect(() => {
    void reloadProfileAndWallets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleVerifyAndLinkWallet = async () => {
    if (!address || !isConnected) {
      toast.error('Please connect your wallet first.')
      return
    }
    setLinkingWallet(true)
    try {
      // 1. Request cryptographic nonce challenge from PostgreSQL backend
      const challenge = await apiGetWalletChallenge(address)

      // 2. Prompt wallet to sign challenge
      const signature = await signMessageAsync({ message: challenge.challengeText })

      // 3. Submit signature to backend for cryptographic verification
      const result = await apiLinkWallet(address, signature)
      toast.success(result.message)
      await reloadProfileAndWallets()
    } catch (err) {
      toast.error('Verification failed: ' + (err as Error).message)
    } finally {
      setLinkingWallet(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await upsertUserProfile(user.uid, { bio: form.bio, github: form.github })
      setProfile((p) => ({ ...p, bio: form.bio, github: form.github }))
      setEditing(false)
      toast.success('Profile saved.')
    } catch {
      toast.error('Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-32 bg-gray-100 animate-pulse border-2 border-gray-200" />

  if (!user) {
    return (
      <div className="max-w-md mx-auto text-center pt-12">
        <div className="border-2 border-black p-8 bg-white shadow-[4px_4px_0px_black] space-y-4">
          <User size={32} className="mx-auto" />
          <h2 className="font-display font-bold text-xl">Sign in to view your profile</h2>
          <button
            onClick={() => void signInWithGoogle()}
            className="w-full border-2 border-black bg-black text-white py-3 font-bold text-sm hover:bg-yellow-300 hover:text-black transition-all"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display font-bold text-2xl tracking-tight">Profile</h1>

      {/* Identity card */}
      <div className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_black] space-y-4">
        <div className="flex items-center gap-4">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-14 h-14 border-2 border-black" />
          ) : (
            <div className="w-14 h-14 border-2 border-black bg-yellow-300 flex items-center justify-center font-bold text-xl">
              {(user.displayName ?? user.email ?? '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-bold text-base">{user.displayName ?? 'Anonymous'}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">App Identity</p>
          <p className="font-mono text-xs text-gray-600">{user.uid}</p>
          <p className="text-xs text-gray-400 mt-0.5">Firebase UID — stable identifier across sessions.</p>
        </div>
      </div>

      {/* Wallet Identity & Cryptographic Verification */}
      <div className="border-2 border-black bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400">Connected Wallet (Arc Testnet)</h2>
          {isConnected && address && linkedWallets.some((w) => w.address.toLowerCase() === address.toLowerCase() && w.verified) && (
            <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-300 border border-black px-2 py-0.5">
              <CheckCircle2 size={12} /> Verified & Linked
            </span>
          )}
        </div>

        {isConnected && address ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold bg-gray-100 px-2 py-1 border border-black">{address}</span>
              <a href={explorerAddr(address)} target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-black transition-colors" title="View on ArcScan">
                <ExternalLink size={16} />
              </a>
            </div>

            {linkedWallets.some((w) => w.address.toLowerCase() === address.toLowerCase() && w.verified) ? (
              <p className="text-xs text-green-800 font-medium">
                ✓ This wallet is cryptographically bound to your Google account with signature challenge proof.
              </p>
            ) : (
              <div className="border border-dashed border-black p-3 bg-yellow-50 space-y-2">
                <p className="text-xs text-gray-700">
                  Prove ownership of this wallet by signing a cryptographic nonce challenge. Never shares private keys.
                </p>
                <button
                  type="button"
                  onClick={() => { void handleVerifyAndLinkWallet() }}
                  disabled={linkingWallet}
                  className="inline-flex items-center gap-1.5 border-2 border-black bg-black text-white hover:bg-yellow-300 hover:text-black px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <ShieldCheck size={14} />
                  {linkingWallet ? 'Requesting & Verifying…' : 'Verify & Link Wallet via Signature'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Connect an Arc Testnet wallet to verify ownership and participate.</p>
            <ConnectKitButton />
          </div>
        )}

        {linkedWallets.length > 0 && (
          <div className="border-t-2 border-gray-100 pt-3">
            <p className="text-xs font-bold text-gray-500 mb-2">Linked Wallets in PostgreSQL ({linkedWallets.length}):</p>
            <div className="space-y-1">
              {linkedWallets.map((w) => (
                <div key={w.id} className="flex items-center justify-between text-xs font-mono bg-gray-50 p-1.5 border border-gray-200">
                  <span>{formatAddress(w.address)}</span>
                  <span className="text-green-700 font-bold font-sans">Verified</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bio & links */}
      <div className="border-2 border-black bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400">About</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs border-2 border-black px-3 py-1 font-bold hover:bg-yellow-300 transition-colors">
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-bold mb-1">Bio</label>
              <textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                placeholder="Tell contributors about yourself…"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">GitHub username</label>
              <input
                type="text"
                value={form.github}
                onChange={(e) => setForm({ ...form, github: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                placeholder="octocat"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleSave()} disabled={saving}
                className="border-2 border-black bg-black text-white px-4 py-2 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="border-2 border-black px-4 py-2 text-sm font-medium hover:bg-yellow-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {profile.bio ? (
              <p className="text-sm text-gray-700">{profile.bio}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No bio yet.</p>
            )}
            {profile.github && (
              <a href={`https://github.com/${profile.github}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm hover:underline">
                <Github size={15} />
                {profile.github}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
