/**
 * «Portatile fuori ufficio»: copia dei dati di un workspace di rete su questo
 * PC, nella cartella dati dell'app (mai nelle cartelle dei progetti), per
 * continuare a lavorare quando la cartella condivisa non si raggiunge (treno,
 * cliente, VPN spenta). Al ritorno le modifiche fatte qui si uniscono a quelle
 * dei colleghi (vedi merge3.ts).
 *
 * Protezione della copia:
 *  - workspace con la cifratura attiva: i dati sono cifrati con la stessa
 *    chiave dati del workspace (serve la password, come in ufficio);
 *  - altrimenti, su Windows, con DPAPI (leggibili solo dall'account Windows
 *    corrente su questo PC);
 *  - altrove in chiaro, come i file nella cartella condivisa.
 * workspace.json (nome, impostazioni, hash della password, chiave avvolta)
 * resta leggibile: serve per chiedere la password e aprire la copia.
 */
import { getFs } from './fs'
import { fromB64, toB64 } from './crypto'
import { isEncryptedText, type DataCipher } from './vault'
import { samePath } from './projectScan'
import { AuditEntrySchema, ProjectSchema, TreeFileSchema, UserSchema, WorkspaceMetaSchema, type AuditEntry, type Project, type TreeFile, type User, type WorkspaceMeta } from '@/types'
import { z } from 'zod'

const DIR = 'offline'
const DPAPI = 'DPAPI:'

export interface OfflineData {
  savedAt: string
  users: User[]
  tree: TreeFile
  /** Progetti come li vede ora questo PC (con le modifiche fatte offline). */
  projects: Record<string, Project>
  /** Per i progetti modificati offline: com'erano all'ultimo allineamento (base dell'unione). */
  base: Record<string, Project>
  /** Voci di cronologia da aggiungere al ritorno. */
  pendingAudit: AuditEntry[]
}
const OfflineDataSchema = z.object({
  savedAt: z.string(),
  users: z.array(UserSchema),
  tree: TreeFileSchema,
  projects: z.record(z.string(), ProjectSchema),
  base: z.record(z.string(), ProjectSchema).default({}),
  pendingAudit: z.array(AuditEntrySchema).default([]),
})

const OfflineFileSchema = z.object({ v: z.literal(1), path: z.string(), meta: WorkspaceMetaSchema, body: z.string() })
export type OfflineFile = z.infer<typeof OfflineFileSchema>

async function dir() {
  const fs = await getFs()
  const d = await fs.join(await fs.appDataDir(), DIR)
  if (!(await fs.exists(d))) await fs.mkdir(d)
  return d
}
const fileOf = async (workspaceId: string) => (await getFs()).join(await dir(), `${workspaceId.replace(/[^A-Za-z0-9_-]/g, '')}.json`)

export async function saveOffline(path: string, meta: WorkspaceMeta, data: OfflineData, cipher: DataCipher | null) {
  const fs = await getFs()
  const json = JSON.stringify(data)
  let body: string
  if (cipher) body = await cipher.encryptText(json)
  else {
    const sealed = await fs.protectSecret(json)
    body = sealed ? DPAPI + toB64(sealed) : json
  }
  const file: OfflineFile = { v: 1, path, meta, body }
  await fs.writeTextAtomic(await fileOf(meta.id), JSON.stringify(file))
}

/** La copia del workspace che sta in `path`, se c'è (senza decifrarla). */
export async function findOffline(path: string): Promise<OfflineFile | null> {
  const fs = await getFs()
  const d = await dir()
  for (const name of await fs.readDir(d).catch(() => [])) {
    if (!name.endsWith('.json')) continue
    try {
      const f = OfflineFileSchema.parse(JSON.parse(await fs.readText(await fs.join(d, name))))
      if (samePath(f.path, path)) return f
    } catch {
      /* file non valido: si ignora */
    }
  }
  return null
}

/** I dati della copia; null se non si possono leggere (chiave sbagliata, altro utente Windows…). */
export async function readOffline(f: OfflineFile, cipher: DataCipher | null): Promise<OfflineData | null> {
  try {
    let json: string | null
    if (isEncryptedText(f.body)) json = cipher ? await cipher.decryptText(f.body) : null
    else if (f.body.startsWith(DPAPI)) json = await (await getFs()).unprotectSecret(fromB64(f.body.slice(DPAPI.length)))
    else json = f.body
    return json ? (OfflineDataSchema.parse(JSON.parse(json)) as OfflineData) : null
  } catch {
    return null
  }
}

export async function removeOffline(workspaceId: string) {
  const fs = await getFs()
  const p = await fileOf(workspaceId)
  if (await fs.exists(p)) await fs.remove(p)
}

/** Toglie tutte le copie da questo PC (quando si disattiva la funzione). */
export async function removeAllOffline() {
  const fs = await getFs()
  const d = await dir()
  for (const name of await fs.readDir(d).catch(() => [])) if (name.endsWith('.json')) await fs.remove(await fs.join(d, name)).catch(() => {})
}
