/**
 * Indice degli embedding per PC (0.7.0): i vettori del testo dei progetti
 * calcolati dall'IA locale restano in un file nella cartella dell'app
 * (es. %APPDATA%), così «Chiedi al progetto» non ricalcola tutto a ogni
 * domanda né a ogni avvio. La chiave è un'impronta del testo: se il testo
 * cambia, il vettore si ricalcola da solo; quelli non più usati da 60 giorni
 * si eliminano al salvataggio.
 *
 * Con i dati del workspace cifrati l'indice resta solo in memoria: i vettori
 * descrivono il contenuto e non devono finire in chiaro sul disco.
 */
import { getFs } from './fs'
import { fromB64, toB64 } from './crypto'

const VERSION = 1
const KEEP_DAYS = 60
const today = () => Math.floor(Date.now() / 86_400_000)

/** Impronta veloce (cyrb53) del testo, con la lunghezza: basta per distinguere i passaggi. */
export function textKey(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}.${text.length.toString(36)}`
}

const toBytes = (v: number[]) => new Uint8Array(new Float32Array(v).buffer)
const fromBytes = (b: Uint8Array) => Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))

export interface VectorStore {
  get(text: string): number[] | undefined
  set(text: string, vector: number[]): void
}

export class VectorIndex implements VectorStore {
  private entries = new Map<string, { v: number[]; d: number }>()
  private dirty = false
  private constructor(
    readonly model: string,
    private readonly path: string | null,
  ) {}

  /** Indice del workspace per il modello indicato; `persist` false = solo in memoria. */
  static async open(workspaceId: string, model: string, persist: boolean): Promise<VectorIndex> {
    if (!persist) return new VectorIndex(model, null)
    const fs = await getFs()
    const dir = await fs.join(await fs.appDataDir(), 'ia')
    const path = await fs.join(dir, `indice-${workspaceId.replace(/[^\w-]/g, '_')}.json`)
    const idx = new VectorIndex(model, path)
    try {
      if (await fs.exists(path)) {
        const raw = JSON.parse(await fs.readText(path)) as { version?: number; model?: string; entries?: Record<string, [string, number]> }
        if (raw.version === VERSION && raw.model === model)
          for (const [k, [b64, d]] of Object.entries(raw.entries ?? {})) idx.entries.set(k, { v: fromBytes(fromB64(b64)), d })
      }
    } catch {
      /* file illeggibile: si riparte da un indice vuoto */
    }
    return idx
  }

  get size() {
    return this.entries.size
  }
  get(text: string) {
    const e = this.entries.get(textKey(text))
    if (!e) return undefined
    const d = today()
    if (e.d !== d) {
      e.d = d
      this.dirty = true
    }
    return e.v
  }
  set(text: string, vector: number[]) {
    this.entries.set(textKey(text), { v: vector, d: today() })
    this.dirty = true
  }

  /** Salva (se è cambiato qualcosa), togliendo i vettori non usati da tempo. */
  async save() {
    if (!this.path || !this.dirty) return
    const min = today() - KEEP_DAYS
    const entries: Record<string, [string, number]> = {}
    for (const [k, e] of this.entries) if (e.d >= min) entries[k] = [toB64(toBytes(e.v)), e.d]
    const fs = await getFs()
    const dir = this.path.slice(0, Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\')))
    if (dir && !(await fs.exists(dir))) await fs.mkdir(dir)
    await fs.writeTextAtomic(this.path, JSON.stringify({ version: VERSION, model: this.model, entries }))
    this.dirty = false
  }
}
