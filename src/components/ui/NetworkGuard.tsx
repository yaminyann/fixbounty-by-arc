import { useAccount, useSwitchChain } from 'wagmi'
import { TARGET_CHAIN_ID, TARGET_CHAIN } from '@/lib/contract'
import { AlertTriangle } from 'lucide-react'

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === TARGET_CHAIN_ID) return <>{children}</>

  return (
    <div className="border-2 border-black bg-yellow-300 p-4 shadow-[4px_4px_0px_black] flex items-start gap-3">
      <AlertTriangle size={20} className="shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-bold text-sm">Wrong network</p>
        <p className="text-sm mt-0.5">
          TaskFi runs on <strong>{TARGET_CHAIN.name}</strong>. Please switch to continue.
        </p>
      </div>
      <button
        onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
        disabled={isPending}
        className="border-2 border-black bg-black text-white px-3 py-1.5 text-sm font-bold hover:bg-yellow-300 hover:text-black transition-all disabled:opacity-60 shrink-0"
      >
        {isPending ? 'Switching…' : 'Switch Network'}
      </button>
    </div>
  )
}
