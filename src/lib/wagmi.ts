import { createConfig, http } from 'wagmi'
import { injected, mock, walletConnect } from 'wagmi/connectors'
import { appChain } from '@/lib/chain'
import { env } from '@/lib/env'
import { registerChain } from '@/tracing'

registerChain(appChain.id, env.rpcUrl)

/** Account the browser test wallet signs with. Anvil's well-known dev account #1. */
const E2E_WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

const connectors =
  import.meta.env.MODE === 'e2e'
    ? [
        mock({
          features: { reconnect: true },
          accounts: [
            (localStorage.getItem('e2e_wallet') as `0x${string}` | null) ?? E2E_WALLET,
          ],
        }),
      ]
    : [injected(), ...(env.walletConnectProjectId ? [walletConnect({ projectId: env.walletConnectProjectId, showQrModal: true })] : [])]

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors,
  transports: { [appChain.id]: http(env.rpcUrl) },
  ssr: false,
})
