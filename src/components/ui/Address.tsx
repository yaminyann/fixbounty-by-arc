import { useState } from 'react'
import { Check, Copy, ExternalLink as ExternalIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { explorerAddress, explorerTx } from '@/lib/chain'
import { shortAddress } from '@/lib/money'

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      className={cn('grid size-6 place-items-center rounded text-mute hover:bg-signal-soft hover:text-ink', className)}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  )
}

/** Short address with copy and explorer shortcuts. */
export function AddressChip({ address, self, className }: { address: string; self?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <span className="num rounded bg-line/60 px-1.5 py-0.5 text-xs" title={address}>
        {shortAddress(address)}
      </span>
      {self && <span className="ml-1 rounded bg-signal px-1.5 text-xs font-bold">You</span>}
      <CopyButton value={address} label="Copy address" />
      <a
        href={explorerAddress(address)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View address on the explorer"
        className="grid size-6 place-items-center rounded text-mute hover:bg-signal-soft hover:text-ink"
      >
        <ExternalIcon size={14} aria-hidden />
      </a>
    </span>
  )
}

export function TxLink({ hash, className }: { hash: string; className?: string }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('num inline-flex items-center gap-1 text-xs underline decoration-ink/30 underline-offset-2 hover:decoration-ink', className)}
    >
      {hash.slice(0, 8)}…{hash.slice(-6)}
      <ExternalIcon size={12} aria-hidden />
    </a>
  )
}

export function Avatar({ name, src, size = 28 }: { name?: string | null; src?: string | null; size?: number }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return src ? (
    <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full border border-ink object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-ink bg-signal text-xs font-bold"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  )
}
