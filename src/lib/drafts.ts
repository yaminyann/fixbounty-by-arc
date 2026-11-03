/** Small localStorage helpers so a half-finished on-chain flow can be resumed after a reload. */

export function saveDraft<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or disabled; the flow still works, it just cannot be resumed.
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function listDrafts<T>(prefix: string): { key: string; value: T }[] {
  const out: { key: string; value: T }[] = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const value = loadDraft<T>(key)
        if (value) out.push({ key, value })
      }
    }
  } catch {
    // ignore
  }
  return out
}

export const bountyDraftKey = (wallet: string, onchainId: number | string) => `fb.bounty.${wallet.toLowerCase()}.${onchainId}`
export const notesDraftKey = (wallet: string, onchainId: number) => `fb.notes.${wallet.toLowerCase()}.${onchainId}`
