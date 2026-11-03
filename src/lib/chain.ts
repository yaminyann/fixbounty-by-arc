import { defineChain } from 'viem'
import { arcTestnet } from 'viem/chains'
import { env } from '@/lib/env'

/** The one chain the app transacts on. Defaults to Arc Testnet; env can point it at a local node for testing. */
export const appChain =
  env.chainId === arcTestnet.id
    ? defineChain({
        ...arcTestnet,
        rpcUrls: { default: { http: [env.rpcUrl] } },
        blockExplorers: { default: { name: 'Arc Explorer', url: env.explorerUrl } },
      })
    : defineChain({
        id: env.chainId,
        name: env.chainId === 31337 ? 'Local test chain' : `Chain ${env.chainId}`,
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: { default: { http: [env.rpcUrl] } },
        blockExplorers: { default: { name: 'Explorer', url: env.explorerUrl } },
      })

export const explorerTx = (hash: string) => `${env.explorerUrl}/tx/${hash}`
export const explorerAddress = (address: string) => `${env.explorerUrl}/address/${address}`
