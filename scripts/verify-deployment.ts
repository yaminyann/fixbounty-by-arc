/**
 * Checks a BountyBoard deployment against the values the platform expects.
 *
 *   BOUNTY_BOARD_ADDRESS=0x... TREASURY_ADDRESS=0x... bun run scripts/verify-deployment.ts
 *
 * Optional: ARC_RPC_URL (default https://rpc.testnet.arc.io), USDC_ADDRESS.
 */
import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { BOUNTY_BOARD_ABI } from '../src/lib/bountyBoardAbi'

const contract = process.env.BOUNTY_BOARD_ADDRESS as `0x${string}` | undefined
const treasury = process.env.TREASURY_ADDRESS as `0x${string}` | undefined
const usdc = (process.env.USDC_ADDRESS ?? '0x3600000000000000000000000000000000000000') as `0x${string}`
const rpc = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'

if (!contract || !treasury) {
  console.error('Set BOUNTY_BOARD_ADDRESS and TREASURY_ADDRESS.')
  process.exit(1)
}

const client = createPublicClient({ chain: arcTestnet, transport: http(rpc) })
let failed = false
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!ok) failed = true
}

const chainId = await client.getChainId()
check('chain id', chainId === arcTestnet.id, String(chainId))

const code = await client.getCode({ address: contract })
check('bytecode present', Boolean(code && code !== '0x'), `${code?.length ?? 0} chars`)

const read = <N extends 'usdc' | 'treasury' | 'POST_FEE_BPS' | 'CLAIM_FEE_BPS' | 'CLAIM_GRACE_PERIOD' | 'REVIEW_PERIOD' | 'MAX_WINNERS' | 'getBountyCount'>(functionName: N) =>
  client.readContract({ address: contract, abi: BOUNTY_BOARD_ABI, functionName })

check('usdc() matches', String(await read('usdc')).toLowerCase() === usdc.toLowerCase())
check('treasury() matches', String(await read('treasury')).toLowerCase() === treasury.toLowerCase())
check('post fee is 0.5%', (await read('POST_FEE_BPS')) === 50n)
check('claim fee is 5%', (await read('CLAIM_FEE_BPS')) === 500n)
check('claim grace is 7 days', (await read('CLAIM_GRACE_PERIOD')) === 7n * 24n * 3600n)
check('review period is 7 days', (await read('REVIEW_PERIOD')) === 7n * 24n * 3600n)
check('max winners is 10', Number(await read('MAX_WINNERS')) === 10)
console.log(`bounties created so far: ${await read('getBountyCount')}`)

process.exit(failed ? 1 : 0)
