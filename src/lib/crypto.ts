/**
 * Encrypted reports for confidential bounties, using only the browser's WebCrypto.
 *
 * - The creator has one ECDH P-256 key pair. The public key is stored on the server. The private key is stored there
 *   too, but wrapped (AES-GCM) with a key derived from a wallet signature, so the server never sees it.
 * - A contributor encrypts the report in the browser to the creator's public key (ephemeral ECDH, HKDF, AES-GCM).
 *   The ciphertext is what gets hashed on-chain and stored. Only the creator can decrypt it.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Plaintext limit in bytes, so the ciphertext fits the 5000 character submission limit. */
export const MAX_REPORT_BYTES = 3000
export const REPORT_PREFIX = 'enc:v1:'

export const unlockMessage = (address: string) =>
  [
    'BountyFi encryption key v1',
    '',
    `Wallet: ${address.toLowerCase()}`,
    'Signing unlocks the key that decrypts confidential reports sent to you.',
    'It is free and sends no transaction. Only sign it on bountyfi.xyz.',
  ].join('\n')

export const isEncryptedReport = (text: string | null | undefined): text is string => typeof text === 'string' && text.startsWith(REPORT_PREFIX)

// --- base64url -------------------------------------------------------------------------------------

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function requireCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot encrypt. Open the site over HTTPS in an up-to-date browser.')
  return crypto.subtle
}

// --- key wrapping -------------------------------------------------------------------------------------

async function wrappingKey(signature: string): Promise<CryptoKey> {
  const subtle = requireCrypto()
  const material = await subtle.importKey('raw', await subtle.digest('SHA-256', enc.encode(signature)), 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('bountyfi-wrap-v1'), info: enc.encode('private-key') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Creates a key pair and wraps its private half with the wallet signature. */
export async function createWrappedKeyPair(signature: string): Promise<{ publicJwk: JsonWebKey; wrappedPrivate: string }> {
  const subtle = requireCrypto()
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey)
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = await subtle.encrypt({ name: 'AES-GCM', iv }, await wrappingKey(signature), enc.encode(JSON.stringify(privateJwk)))
  return { publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }, wrappedPrivate: `v1.${toB64(iv)}.${toB64(body)}` }
}

export async function unwrapPrivateKey(wrapped: string, signature: string): Promise<CryptoKey> {
  const subtle = requireCrypto()
  const [version, iv, body] = wrapped.split('.')
  if (version !== 'v1' || !iv || !body) throw new Error('The stored key has an unknown format.')
  let jwk: JsonWebKey
  try {
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await wrappingKey(signature), fromB64(body))
    jwk = JSON.parse(dec.decode(plain)) as JsonWebKey
  } catch {
    throw new Error('This wallet signature does not unlock the key. Use the wallet that created it.')
  }
  return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
}

// --- reports ----------------------------------------------------------------------------------------------

async function sharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const subtle = requireCrypto()
  const bits = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const material = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('bountyfi-report-v1'), info: enc.encode('aes-key') }, material, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

const importPublic = (jwk: JsonWebKey) => requireCrypto().importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: 'ECDH', namedCurve: 'P-256' }, true, [])

/** Encrypts a report to the creator's public key. Output: enc:v1:<x>.<y>.<iv>.<ciphertext>, all base64url. */
export async function encryptReport(plaintext: string, recipient: JsonWebKey): Promise<string> {
  const bytes = enc.encode(plaintext)
  if (bytes.length > MAX_REPORT_BYTES) throw new Error(`Reports can be up to ${MAX_REPORT_BYTES} characters.`)
  const subtle = requireCrypto()
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const key = await sharedKey(ephemeral.privateKey, await importPublic(recipient))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
  const epk = await subtle.exportKey('jwk', ephemeral.publicKey)
  return `${REPORT_PREFIX}${epk.x}.${epk.y}.${toB64(iv)}.${toB64(ct)}`
}

export async function decryptReport(payload: string, privateKey: CryptoKey): Promise<string> {
  if (!isEncryptedReport(payload)) throw new Error('This is not an encrypted report.')
  const [x, y, iv, ct] = payload.slice(REPORT_PREFIX.length).split('.')
  if (!x || !y || !iv || !ct) throw new Error('The encrypted report is damaged.')
  try {
    const key = await sharedKey(privateKey, await importPublic({ kty: 'EC', crv: 'P-256', x, y }))
    return dec.decode(await requireCrypto().decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct)))
  } catch {
    throw new Error('This report was not encrypted to your key, or it was changed.')
  }
}
