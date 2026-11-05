import { useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { createWrappedKeyPair, decryptReport, unlockMessage, unwrapPrivateKey } from '@/lib/crypto'
import { useEncryptionKey, useSaveEncryptionKey } from '@/lib/api/ecosystem'
import { errorMessage } from '@/lib/api/client'

// The unlocked private key lives only in memory for this tab, so the wallet is asked once per visit.
let unlocked: { address: string; key: CryptoKey } | null = null

/** Wallet-backed encryption for confidential reports. Nothing sensitive leaves the browser unencrypted. */
export function useEncryption(enabled = true) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const keyQuery = useEncryptionKey(enabled)
  const save = useSaveEncryptionKey()

  /** Creates the key pair. The wallet signs twice and both signatures must match, so the key can always be unlocked again. */
  const setup = useCallback(async () => {
    if (!address) throw new Error('Connect your wallet first.')
    const message = unlockMessage(address)
    const first = await signMessageAsync({ message })
    const second = await signMessageAsync({ message })
    if (first !== second) {
      throw new Error('This wallet signs differently each time, so it cannot safely protect an encryption key. Use a standard browser wallet.')
    }
    const pair = await createWrappedKeyPair(first)
    await save.mutateAsync(pair)
    await keyQuery.refetch()
  }, [address, signMessageAsync, save, keyQuery])

  const unlock = useCallback(async (): Promise<CryptoKey> => {
    if (!address) throw new Error('Connect your wallet first.')
    if (unlocked && unlocked.address === address.toLowerCase()) return unlocked.key
    const stored = keyQuery.data ?? (await keyQuery.refetch()).data
    if (!stored) throw new Error('You have not set up an encryption key yet. Do it in Settings.')
    const signature = await signMessageAsync({ message: unlockMessage(address) })
    const key = await unwrapPrivateKey(stored.wrappedPrivate, signature)
    unlocked = { address: address.toLowerCase(), key }
    return key
  }, [address, keyQuery, signMessageAsync])

  const decrypt = useCallback(
    async (payload: string): Promise<string> => {
      try {
        return await decryptReport(payload, await unlock())
      } catch (err) {
        throw new Error(/reject|denied/i.test(errorMessage(err)) ? 'You declined the signature request.' : errorMessage(err))
      }
    },
    [unlock],
  )

  return { key: keyQuery.data ?? null, loading: keyQuery.isPending && enabled, setup, decrypt, busy: save.isPending }
}
