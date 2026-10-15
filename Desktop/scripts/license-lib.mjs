// Funzioni condivise dagli script di licenza (keygen, issue) e dal server
// licenze. La stessa canonicalizzazione è in src/services/license.ts: se
// cambia qui deve cambiare anche lì.
import * as ed from '@noble/ed25519'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const KEY_DIR = join(homedir(), '.pgm')
export const SECRET_KEY_FILE = join(KEY_DIR, 'license-signing.key')
export const PUBLIC_KEY_FILE = join(KEY_DIR, 'license-signing.pub')

/** JSON canonico: chiavi ordinate ricorsivamente, nessuno spazio. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
export const fromHex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)))
export const b64 = (bytes) => Buffer.from(bytes).toString('base64')

export function loadSecretKey() {
  try {
    return fromHex(readFileSync(SECRET_KEY_FILE, 'utf8').trim())
  } catch {
    throw new Error(`Chiave privata non trovata in ${SECRET_KEY_FILE}: esegui prima "node scripts/license-keygen.mjs".`)
  }
}

/** Firma una licenza (oggetto senza `sig`) e restituisce l'oggetto completo. */
export async function signLicense(license, secretKey) {
  const { sig: _ignored, ...payload } = license
  const msg = new TextEncoder().encode(canonical(payload))
  const sig = await ed.signAsync(msg, secretKey)
  return { ...payload, sig: b64(sig) }
}

export async function verifyLicense(license, publicKeyHex) {
  const { sig, ...payload } = license
  if (typeof sig !== 'string') return false
  const msg = new TextEncoder().encode(canonical(payload))
  return ed.verifyAsync(Buffer.from(sig, 'base64'), msg, fromHex(publicKeyHex))
}
