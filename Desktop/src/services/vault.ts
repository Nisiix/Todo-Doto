/**
 * Cifratura dei dati del workspace sul disco (workspace di rete).
 *
 * Schema a due chiavi:
 * - una **chiave dati** casuale (AES-GCM 256 bit) cifra ogni file del workspace;
 * - la chiave dati è salvata in workspace.json **avvolta** (cifrata) con una
 *   chiave derivata dalla password del workspace (PBKDF2-SHA256).
 * Cambiare la password riavvolge solo la chiave dati: i file non si riscrivono
 * e le copie di sicurezza già fatte restano leggibili.
 *
 * Formato dei file cifrati: testo `PGMENC1:` + base64(iv 12 byte + dati cifrati);
 * per i file binari (copie di sicurezza) gli stessi byte con il prefisso
 * `PGMENC1:` in ASCII. I file in chiaro restano leggibili: durante l'attivazione
 * (o con file di versioni precedenti) convivono con quelli cifrati.
 *
 * workspace.json resta in chiaro: contiene solo nome, impostazioni, l'hash della
 * password e la chiave dati avvolta, servono per aprire il workspace.
 */
import { fromB64, toB64, PBKDF2_ITERATIONS } from './crypto'
import type { EncryptionInfo } from '@/types'

export const ENC_PREFIX = 'PGMENC1:'
const PREFIX_BYTES = new TextEncoder().encode(ENC_PREFIX)
const enc = new TextEncoder()
const dec = new TextDecoder()

/** Un file letto è cifrato ma non c'è la chiave (password mancante o cambiata). */
export class EncryptedDataError extends Error {
  constructor() {
    super('encrypted')
  }
}

export const isEncryptedText = (text: string) => text.startsWith(ENC_PREFIX)
export const isEncryptedBytes = (b: Uint8Array) => b.length > PREFIX_BYTES.length && PREFIX_BYTES.every((x, i) => b[i] === x)

async function kek(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function seal(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  const out = new Uint8Array(new ArrayBuffer(12 + ct.length))
  out.set(iv, 0)
  out.set(ct, 12)
  return out
}
async function open(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = data.slice(0, 12)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data.slice(12)))
}

/** Cifra e decifra i file del workspace con la chiave dati. */
export class DataCipher {
  private constructor(
    private readonly key: CryptoKey,
    /** Chiave dati in chiaro (solo in memoria): serve per riavvolgerla con una nuova password. */
    readonly raw: Uint8Array<ArrayBuffer>,
  ) {}

  static async fromRaw(raw: Uint8Array<ArrayBuffer>) {
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    return new DataCipher(key, raw)
  }

  async encryptText(plain: string): Promise<string> {
    return ENC_PREFIX + toB64(await seal(this.key, enc.encode(plain)))
  }
  async decryptText(text: string): Promise<string> {
    return dec.decode(await open(this.key, fromB64(text.slice(ENC_PREFIX.length))))
  }
  async encryptBytes(plain: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const body = await seal(this.key, plain)
    const out = new Uint8Array(new ArrayBuffer(PREFIX_BYTES.length + body.length))
    out.set(PREFIX_BYTES, 0)
    out.set(body, PREFIX_BYTES.length)
    return out
  }
  async decryptBytes(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return open(this.key, new Uint8Array(data.slice(PREFIX_BYTES.length)))
  }
}

/** Nuova chiave dati, avvolta con la password. */
export async function createEncryption(password: string): Promise<{ info: EncryptionInfo; cipher: DataCipher }> {
  const raw = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)))
  const cipher = await DataCipher.fromRaw(raw)
  return { info: await wrapKey(raw, password, true), cipher }
}

/** Avvolge la chiave dati con (una nuova) password: nuovo sale, stessa chiave. */
export async function wrapKey(raw: Uint8Array<ArrayBuffer>, password: string, enabled: boolean): Promise<EncryptionInfo> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const k = await kek(password, salt, PBKDF2_ITERATIONS)
  return { v: 1, enabled, salt: toB64(salt), iterations: PBKDF2_ITERATIONS, wrapped: toB64(await seal(k, raw)) }
}

/** Chiave dati dalla password; null se la password non la apre. */
export async function unwrapKey(info: EncryptionInfo, password: string): Promise<DataCipher | null> {
  try {
    const k = await kek(password, fromB64(info.salt), info.iterations)
    return await DataCipher.fromRaw(await open(k, fromB64(info.wrapped)))
  } catch {
    return null
  }
}
