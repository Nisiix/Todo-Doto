/**
 * Configurazione per macchina: tema, workspace recenti, password cifrate.
 * Vive in appDataDir (es. %APPDATA%\com.nisos.projectgoalmanager).
 */
import { getFs } from './fs'
import { CredentialsFileSchema, LocalConfigSchema, type CredentialsFile, type LocalConfig } from '@/types'
import { decryptLocal, encryptLocal } from './crypto'

const CONFIG = 'config.json'
const CREDENTIALS = 'credentials.json'

async function appFile(name: string) {
  const fs = await getFs()
  const dir = await fs.appDataDir()
  if (!(await fs.exists(dir))) await fs.mkdir(dir)
  return fs.join(dir, name)
}

async function readJson<T>(name: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
  const fs = await getFs()
  try {
    const p = await appFile(name)
    if (!(await fs.exists(p))) return fallback
    return parse(JSON.parse(await fs.readText(p)))
  } catch {
    return fallback
  }
}

async function writeJson(name: string, data: unknown) {
  const fs = await getFs()
  await fs.writeTextAtomic(await appFile(name), JSON.stringify(data, null, 2))
}

export const loadConfig = () =>
  readJson(CONFIG, (r) => LocalConfigSchema.parse(r), LocalConfigSchema.parse({}))
export const saveConfig = (c: LocalConfig) => writeJson(CONFIG, c)

const loadCredentials = () =>
  readJson<CredentialsFile>(CREDENTIALS, (r) => CredentialsFileSchema.parse(r), { entries: {} })

export async function rememberPassword(workspaceId: string, password: string, secret: string) {
  const creds = await loadCredentials()
  creds.entries[workspaceId] = await encryptLocal(password, secret)
  await writeJson(CREDENTIALS, creds)
}

export async function recallPassword(workspaceId: string, secret: string): Promise<string | null> {
  const creds = await loadCredentials()
  const payload = creds.entries[workspaceId]
  return payload ? decryptLocal(payload, secret) : null
}

// --- Google Drive: credenziali del client e token, cifrati con la chiave locale ---

const DRIVE_AUTH = 'drive-auth.json'

export interface DriveAuthFile {
  clientId: string
  clientSecret: string
  tokens: { accessToken: string; refreshToken: string | null; expiresAt: number; scope: string } | null
  account: { email: string; name: string } | null
}

export async function loadDriveAuth(secret: string): Promise<DriveAuthFile | null> {
  const fs = await getFs()
  try {
    const p = await appFile(DRIVE_AUTH)
    if (!(await fs.exists(p))) return null
    const plain = await decryptLocal(await fs.readText(p), secret)
    return plain ? (JSON.parse(plain) as DriveAuthFile) : null
  } catch {
    return null
  }
}

export async function saveDriveAuth(data: DriveAuthFile | null, secret: string) {
  const fs = await getFs()
  const p = await appFile(DRIVE_AUTH)
  if (!data) {
    if (await fs.exists(p)) await fs.remove(p)
    return
  }
  await fs.writeTextAtomic(p, await encryptLocal(JSON.stringify(data), secret))
}

// --- GitHub: token personale (sola lettura), cifrato con la chiave locale ----------

const GITHUB_AUTH = 'github-auth.json'

export interface GitHubAuthFile {
  token: string
  login: string
  name: string
  /** Sincronizza i progetti collegati all'apertura del workspace. */
  autoSync: boolean
}

export async function loadGitHubAuth(secret: string): Promise<GitHubAuthFile | null> {
  const fs = await getFs()
  try {
    const p = await appFile(GITHUB_AUTH)
    if (!(await fs.exists(p))) return null
    const plain = await decryptLocal(await fs.readText(p), secret)
    return plain ? (JSON.parse(plain) as GitHubAuthFile) : null
  } catch {
    return null
  }
}

export async function saveGitHubAuth(data: GitHubAuthFile | null, secret: string) {
  const fs = await getFs()
  const p = await appFile(GITHUB_AUTH)
  if (!data) {
    if (await fs.exists(p)) await fs.remove(p)
    return
  }
  await fs.writeTextAtomic(p, await encryptLocal(JSON.stringify(data), secret))
}

export async function forgetPassword(workspaceId: string) {
  const creds = await loadCredentials()
  delete creds.entries[workspaceId]
  await writeJson(CREDENTIALS, creds)
}
