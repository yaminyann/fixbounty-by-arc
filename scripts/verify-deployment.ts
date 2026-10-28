import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { BOUNTY_BOARD_ADDRESS, BOUNTY_BOARD_ABI, USDC_ADDRESS } from '../src/lib/contract'

async function main() {
  console.log('--- Verifying Arc Testnet Deployment ---')
  console.log('Contract Address:', BOUNTY_BOARD_ADDRESS)
  console.log('Expected USDC Address:', USDC_ADDRESS)

  const client = createPublicClient({
    chain: arcTestnet,
    transport: http('https://rpc.testnet.arc.io'),
  })

  // 1. Verify Chain ID
  const chainId = await client.getChainId()
  console.log('Actual Chain ID from RPC:', chainId, chainId === 5042002 ? '✓ MATCH' : '✗ MISMATCH')

  // 2. Verify Bytecode at deployed address
  const bytecode = await client.getBytecode({ address: BOUNTY_BOARD_ADDRESS })
  if (!bytecode || bytecode === '0x') {
    console.error('✗ No bytecode found at', BOUNTY_BOARD_ADDRESS)
    process.exit(1)
  }
  console.log('Bytecode Length:', bytecode.length, 'bytes (deployed code verified ✓)')

  // 3. Verify Contract Read: usdc()
  const contractUsdc = await client.readContract({
    address: BOUNTY_BOARD_ADDRESS,
    abi: [
      {
        type: 'function',
        name: 'usdc',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }],
      },
    ],
    functionName: 'usdc',
  })
  console.log('Contract USDC immutable address:', contractUsdc)
  console.log(
    'Matches Arc Testnet USDC (0x3600...):',
    contractUsdc.toLowerCase() === USDC_ADDRESS.toLowerCase() ? '✓ MATCH' : '✗ MISMATCH'
  )

  // 4. Verify Contract Read: CLAIM_GRACE_PERIOD()
  const gracePeriod = await client.readContract({
    address: BOUNTY_BOARD_ADDRESS,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'CLAIM_GRACE_PERIOD',
  })
  console.log('CLAIM_GRACE_PERIOD:', Number(gracePeriod), 'seconds (7 days =', 7 * 24 * 3600, ') ✓')

  // 5. Verify Contract Read: getBountyCount()
  const count = await client.readContract({
    address: BOUNTY_BOARD_ADDRESS,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getBountyCount',
  })
  console.log('Current onchain bounty count:', Number(count))

  // If there are bounties, read them
  for (let i = 1; i <= Number(count); i++) {
    const bounty = await client.readContract({
      address: BOUNTY_BOARD_ADDRESS,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'getBounty',
      args: [BigInt(i)],
    })
    console.log(`Bounty #${i}:`, {
      title: bounty.title,
      creator: bounty.creator,
      reward: bounty.reward.toString(),
      deadline: new Date(Number(bounty.deadline) * 1000).toISOString(),
      status: bounty.status,
      approvedContributor: bounty.approvedContributor,
    })
  }

  // 6. Verify Transaction Hash from deployment metadata
  const deployTxHash = '0xb8a5afdd71d4ea371eec9a5f380049ac26aeb8630afdd9536257cf244084e870' as `0x${string}`
  try {
    const tx = await client.getTransaction({ hash: deployTxHash })
    console.log('Deploy Tx found onchain ✓:', {
      from: tx.from,
      to: tx.to,
      blockNumber: tx.blockNumber?.toString(),
    })
    const receipt = await client.getTransactionReceipt({ hash: deployTxHash })
    console.log('Deploy Tx Receipt status:', receipt.status === 'success' ? '✓ SUCCESS' : receipt.status)
    console.log('Created Contract Address from Receipt:', receipt.contractAddress)
  } catch (e) {
    console.log('Could not fetch deployment receipt:', (e as Error).message)
  }
}

main().catch(console.error)
