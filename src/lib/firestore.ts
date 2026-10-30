/**
 * Firestore data layer — off-chain metadata for bounties, submissions, user profiles.
 * Authoritative state (reward amounts, approval, claim status) ALWAYS comes from the chain.
 * Firestore holds: full descriptions, submission notes, display names, profile data.
 * Gracefully handles uninitialized Firestore by returning safe empty defaults and using local cache.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/firebase'

// ---- User profiles ----

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  walletAddress?: string
  bio?: string
  github?: string
  twitter?: string
  website?: string
  createdAt?: DocumentData
  updatedAt?: DocumentData
}

export async function upsertUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  if (!db) return
  try {
    const ref = doc(db, 'users', uid)
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
  } catch (err) {
    console.error('[Firestore] upsertUserProfile failed:', err)
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return snap.data() as UserProfile
  } catch (err) {
    console.error('[Firestore] getUserProfile failed:', err)
    return null
  }
}

// ---- Bounty metadata (off-chain) ----

export interface BountyMeta {
  bountyId: number
  creatorUid: string
  creatorAddress?: string
  description: string        // Full markdown description
  acceptanceCriteria: string // What counts as valid work
  objectives?: string
  requirements?: string
  rules?: string
  eligibility?: string
  deliverables?: string
  submissionInstructions?: string
  tags: string[]
  links?: string[]
  categorySlug?: string
  imageUrl?: string
  moderationStatus?: 'pending' | 'approved' | 'rejected'
  moderationNote?: string
  createdAt?: DocumentData
  updatedAt?: DocumentData
}

// Local cache keys to guarantee zero data loss if network/Firestore is slow or failing
const LOCAL_META_PREFIX = 'taskfi_meta_'
const LEGACY_META_PREFIX = 'fixbounty_meta_'

export function cacheLocalBountyMeta(bountyId: number, data: BountyMeta): void {
  try {
    localStorage.setItem(`${LOCAL_META_PREFIX}${bountyId}`, JSON.stringify(data))
  } catch {
    // Ignore quota errors
  }
}

export function getLocalBountyMeta(bountyId: number): BountyMeta | null {
  try {
    const raw =
      localStorage.getItem(`${LOCAL_META_PREFIX}${bountyId}`) ||
      localStorage.getItem(`${LEGACY_META_PREFIX}${bountyId}`)
    return raw ? (JSON.parse(raw) as BountyMeta) : null
  } catch {
    return null
  }
}

export async function saveBountyMeta(bountyId: number, data: Omit<BountyMeta, 'bountyId'>): Promise<void> {
  const fullMeta: BountyMeta = { bountyId, ...data }
  cacheLocalBountyMeta(bountyId, fullMeta)

  if (!db) return
  try {
    const ref = doc(db, 'bounties', String(bountyId))
    await setDoc(ref, { ...fullMeta, updatedAt: serverTimestamp() }, { merge: true })
  } catch (err) {
    console.error('[Firestore] saveBountyMeta failed:', err)
  }
}

export async function updateBountyMeta(bountyId: number, data: Partial<BountyMeta>): Promise<void> {
  const existing = getLocalBountyMeta(bountyId)
  if (existing) {
    cacheLocalBountyMeta(bountyId, { ...existing, ...data })
  }

  if (!db) return
  try {
    const ref = doc(db, 'bounties', String(bountyId))
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp() })
  } catch (err) {
    console.error('[Firestore] updateBountyMeta failed:', err)
  }
}

export async function getBountyMeta(bountyId: number): Promise<BountyMeta | null> {
  // Check local cache first as an instant fallback
  const cached = getLocalBountyMeta(bountyId)

  if (!db) return cached
  try {
    const snap = await getDoc(doc(db, 'bounties', String(bountyId)))
    if (!snap.exists()) return cached
    const remote = snap.data() as BountyMeta
    cacheLocalBountyMeta(bountyId, remote)
    return remote
  } catch (err) {
    console.error('[Firestore] getBountyMeta failed:', err)
    return cached
  }
}

export async function getRecentBountyMetas(count = 50): Promise<BountyMeta[]> {
  if (!db) return []
  try {
    const q = query(collection(db, 'bounties'), orderBy('createdAt', 'desc'), limit(count))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as BountyMeta)
  } catch (err) {
    console.error('[Firestore] getRecentBountyMetas failed:', err)
    return []
  }
}

export async function getBountiesByCreator(uid: string, creatorAddress?: string): Promise<BountyMeta[]> {
  if (!db) return []
  try {
    const metasMap = new Map<number, BountyMeta>()
    
    // Query by UID
    if (uid) {
      const qUid = query(
        collection(db, 'bounties'),
        where('creatorUid', '==', uid),
        limit(50),
      )
      const snapUid = await getDocs(qUid)
      for (const d of snapUid.docs) {
        const item = d.data() as BountyMeta
        metasMap.set(item.bountyId, item)
      }
    }

    // Query by creatorAddress if available
    if (creatorAddress) {
      const qAddr = query(
        collection(db, 'bounties'),
        where('creatorAddress', '==', creatorAddress.toLowerCase()),
        limit(50),
      )
      const snapAddr = await getDocs(qAddr)
      for (const d of snapAddr.docs) {
        const item = d.data() as BountyMeta
        metasMap.set(item.bountyId, item)
      }
    }

    return Array.from(metasMap.values())
  } catch (err) {
    console.error('[Firestore] getBountiesByCreator failed:', err)
    return []
  }
}

// ---- Submission metadata ----

export interface SubmissionMeta {
  bountyId: number
  contributorUid: string
  contributorAddress: string
  submissionHash: string      // Must match what's recorded onchain
  title?: string
  description: string         // Work explanation
  solutionDetails?: string
  links: string[]             // PR links, demo URLs, etc.
  seqNumber?: number
  submittedAt?: DocumentData | string | Date
  status?: string
}

export async function saveSubmissionMeta(data: SubmissionMeta): Promise<void> {
  if (!db) return
  try {
    const ref = doc(db, 'submissions', `${data.bountyId}_${data.contributorAddress.toLowerCase()}`)
    await setDoc(ref, {
      ...data,
      contributorAddress: data.contributorAddress.toLowerCase(),
      submittedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    console.error('[Firestore] saveSubmissionMeta failed:', err)
  }
}

export async function getSubmissionMeta(
  bountyId: number,
  contributorAddress: string,
): Promise<SubmissionMeta | null> {
  if (!db) return null
  try {
    const ref = doc(db, 'submissions', `${bountyId}_${contributorAddress.toLowerCase()}`)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return snap.data() as SubmissionMeta
  } catch (err) {
    console.error('[Firestore] getSubmissionMeta failed:', err)
    return null
  }
}

export async function getSubmissionsForBounty(bountyId: number): Promise<SubmissionMeta[]> {
  if (!db) return []
  try {
    const q = query(
      collection(db, 'submissions'),
      where('bountyId', '==', bountyId),
      orderBy('submittedAt', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as SubmissionMeta)
  } catch (err) {
    console.error('[Firestore] getSubmissionsForBounty failed:', err)
    return []
  }
}

export async function getSubmissionsByContributor(uid: string, contributorAddress?: string): Promise<SubmissionMeta[]> {
  if (!db) return []
  try {
    const submissionsMap = new Map<string, SubmissionMeta>()

    if (uid) {
      const q = query(
        collection(db, 'submissions'),
        where('contributorUid', '==', uid),
        orderBy('submittedAt', 'desc'),
        limit(50),
      )
      const snap = await getDocs(q)
      for (const d of snap.docs) {
        const item = d.data() as SubmissionMeta
        submissionsMap.set(`${item.bountyId}_${item.contributorAddress}`, item)
      }
    }

    if (contributorAddress) {
      const q = query(
        collection(db, 'submissions'),
        where('contributorAddress', '==', contributorAddress.toLowerCase()),
        orderBy('submittedAt', 'desc'),
        limit(50),
      )
      const snap = await getDocs(q)
      for (const d of snap.docs) {
        const item = d.data() as SubmissionMeta
        submissionsMap.set(`${item.bountyId}_${item.contributorAddress}`, item)
      }
    }

    return Array.from(submissionsMap.values())
  } catch (err) {
    console.error('[Firestore] getSubmissionsByContributor failed:', err)
    return []
  }
}

// ---- Activity log ----

export interface ActivityEntry {
  id?: string
  bountyId: number
  type: 'created' | 'funded' | 'submitted' | 'approved' | 'claimed' | 'refunded' | 'cancelled'
  actorAddress?: string
  txHash?: string
  message: string
  timestamp?: DocumentData | string | Date
}

export async function logActivity(entry: Omit<ActivityEntry, 'timestamp'>): Promise<void> {
  if (!db) return
  try {
    await addDoc(collection(db, 'activity'), { ...entry, timestamp: serverTimestamp() })
  } catch (err) {
    console.error('[Firestore] logActivity failed:', err)
  }
}

export async function getRecentActivity(count = 30): Promise<ActivityEntry[]> {
  if (!db) return []
  try {
    const q = query(collection(db, 'activity'), orderBy('timestamp', 'desc'), limit(count))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as ActivityEntry)
  } catch (err) {
    console.error('[Firestore] getRecentActivity failed:', err)
    return []
  }
}

export async function getActivityForBounty(bountyId: number): Promise<ActivityEntry[]> {
  if (!db) return []
  try {
    const q = query(
      collection(db, 'activity'),
      where('bountyId', '==', bountyId),
      orderBy('timestamp', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as ActivityEntry)
  } catch (err) {
    console.error('[Firestore] getActivityForBounty failed:', err)
    return []
  }
}

// ---- Profile wallet linking ----
export async function linkWalletToProfile(uid: string, walletAddress: string): Promise<void> {
  if (!db) return
  try {
    await updateDoc(doc(db, 'users', uid), {
      walletAddress: walletAddress.toLowerCase(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[Firestore] linkWalletToProfile failed:', err)
  }
}
