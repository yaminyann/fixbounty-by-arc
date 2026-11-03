const raw = import.meta.env

function num(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const env = {
  chainId: num(raw.VITE_ARC_CHAIN_ID, 5042002),
  rpcUrl: (raw.VITE_ARC_RPC_URL as string | undefined) || 'https://rpc.testnet.arc.io',
  explorerUrl: ((raw.VITE_ARC_EXPLORER_URL as string | undefined) || 'https://explorer.testnet.arc.io').replace(/\/$/, ''),
  walletConnectProjectId: (raw.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) || '',
  apiBase: ((raw.VITE_API_URL as string | undefined) || '/api').replace(/\/$/, ''),
  /** Browser test mode: swaps Google sign-in and the wallet for local stand-ins. Never part of a production build. */
  e2e: raw.MODE === 'e2e',
}
