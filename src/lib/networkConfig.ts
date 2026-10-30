/**
 * TaskFi Network and Contract Address Configuration
 *
 * CRITICAL RULE:
 * Preserves the active deployed BountyBoard smart contract on Arc Testnet:
 * 0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb (Chain ID: 5042002)
 *
 * Testnet is the authoritative default network.
 * Mainnet configuration is isolated and cannot trigger accidental transactions.
 */
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'

export type NetworkName = 'testnet' | 'mainnet'

export const ACTIVE_NETWORK: NetworkName =
  (import.meta.env.VITE_NETWORK as NetworkName) === 'mainnet' ? 'mainnet' : 'testnet'

// Arc Testnet = 5042002, Arc Mainnet = 5042
export const TARGET_CHAIN_ID: number = ACTIVE_NETWORK === 'mainnet' ? 5042 : 5042002
export const TARGET_CHAIN = requireChain(TARGET_CHAIN_ID)
export const TARGET_USDC = getUsdc(TARGET_CHAIN_ID)!
export const USDC_ADDRESS = TARGET_USDC.address as `0x${string}`
export const USDC_DECIMALS = TARGET_USDC.decimals

// Preserved original deployed contract on Arc Testnet (V1 — peer-to-peer non-custodial escrow)
export const BOUNTY_BOARD_V1_TESTNET = '0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb' as `0x${string}`

// V2 address with protocol fee support on Arc Testnet
export const BOUNTY_BOARD_V2_TESTNET = (
  import.meta.env.VITE_BOUNTY_BOARD_V2_ADDRESS ?? '0xfdba32f2f2dbecd193b44ac2182f45a4a998d9bf'
) as `0x${string}`

// Mainnet address: strictly blank until deployed and configured; no hardcoded fallbacks
export const BOUNTY_BOARD_V2_MAINNET = (
  import.meta.env.VITE_BOUNTY_BOARD_V2_MAINNET_ADDRESS ?? ''
) as `0x${string}`

// Active contract address: Defaults to preserving the deployed V1 contract address (0x489cfbd95e8f5a934b7ab1e0fe7a89fa3d0527fb)
export const BOUNTY_BOARD_ADDRESS: `0x${string}` = (
  import.meta.env.VITE_BOUNTY_BOARD_ADDRESS ??
  (ACTIVE_NETWORK === 'mainnet' ? BOUNTY_BOARD_V2_MAINNET : BOUNTY_BOARD_V1_TESTNET)
) as `0x${string}`

// Alias for V2 address
export const BOUNTY_BOARD_V2_ADDRESS: `0x${string}` =
  ACTIVE_NETWORK === 'mainnet' ? BOUNTY_BOARD_V2_MAINNET : BOUNTY_BOARD_V2_TESTNET

// Contract capability flags
export const isV2Contract: boolean =
  BOUNTY_BOARD_ADDRESS.toLowerCase() === BOUNTY_BOARD_V2_TESTNET.toLowerCase()

export const V2_DEPLOYED: boolean =
  Boolean(BOUNTY_BOARD_V2_TESTNET && BOUNTY_BOARD_V2_TESTNET.length > 2)

export const EXPLORER_BASE = TARGET_CHAIN.explorerBase
export const ARC_EXPLORER_URL = EXPLORER_BASE

export function explorerTx(hash: `0x${string}`) {
  return buildTxExplorerUrl(TARGET_CHAIN_ID, hash)
}

export function explorerAddr(addr: string) {
  return `${TARGET_CHAIN.explorerBase}/address/${addr}`
}
