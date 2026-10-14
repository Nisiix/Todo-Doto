/**
 * Hash della password del workspace (PBKDF2-SHA256) e cifratura della password
 * memorizzata sulla macchina (AES-GCM con chiave derivata dall'identità locale).
 * Solo Web Crypto API, nessuna dipendenza esterna.
 */
const enc = new TextEncoder()
const dec = new TextDecoder()

export const PBKDF2_ITERATIONS = 310_000

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number, bits = 256) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bits)
}

export interface PasswordHash {
  salt: string
  hash: string
  iterations: number
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return { salt: toB64(salt), hash: toB64(bits), iterations: PBKDF2_ITERATIONS }
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const bits = await pbkdf2(password, fromB64(stored.salt), stored.iterations)
  const a = new Uint8Array(bits)
  const b = fromB64(stored.hash)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

// --- Cifratura locale -------------------------------------------------------

const LOCAL_SALT = enc.encode('pgm-local-credentials-v1')

async function localKey(secret: string): Promise<CryptoKey> {
  const bits = await pbkdf2(secret, LOCAL_SALT, 120_000)
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Cifra `plain` con una chiave derivata da `secret` (identità locale). */
export async function encryptLocal(plain: string, secret: string): Promise<string> {
  const key = await localKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain))
  return `${toB64(iv)}.${toB64(ct)}`
}

export async function decryptLocal(payload: string, secret: string): Promise<string | null> {
  try {
    const [ivB64, ctB64] = payload.split('.')
    if (!ivB64 || !ctB64) return null
    const key = await localKey(secret)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64))
    return dec.decode(pt)
  } catch {
    return null
  }
}
