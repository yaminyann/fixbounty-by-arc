function num(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Always read individual VITE_ variables. Using the whole `import.meta.env` object would make Vite copy every
// VITE_ variable present at build time into the public bundle, including ones that should never be there.
export const env = {
  chainId: num(import.meta.env.VITE_ARC_CHAIN_ID, 5042002),
  rpcUrl: (import.meta.env.VITE_ARC_RPC_URL as string | undefined) || 'https://rpc.testnet.arc.io',
  explorerUrl: ((import.meta.env.VITE_ARC_EXPLORER_URL as string | undefined) || 'https://explorer.testnet.arc.io').replace(/\/$/, ''),
  walletConnectProjectId: (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) || '',
  apiBase: ((import.meta.env.VITE_API_URL as string | undefined) || '/api').replace(/\/$/, ''),
  /** Browser test mode: swaps Google sign-in and the wallet for local stand-ins. Never part of a production build. */
  e2e: import.meta.env.MODE === 'e2e',
}
