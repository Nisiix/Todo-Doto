/**
 * Errori del filesystem spiegati all'utente, con attenzione ai percorsi di
 * rete (\\server\condivisione) e alle unità mappate (Z:): invece di
 * "os error 53" si dice cosa succede e cosa fare. Più `checkFolder`, che
 * verifica una cartella scelta prima di usarla (raggiungibile, leggibile e,
 * se serve, scrivibile).
 */
import type { FsApi } from './fs'
import { defineMessages } from '@/i18n'

const M = defineMessages({
  it: {
    scope: 'L’app non ha il permesso di usare questo percorso: sceglilo di nuovo con «Sfoglia».',
    notFound: 'La cartella o il file non esiste.',
    pathNotFound: 'Il percorso non esiste.',
    driveMissing: (d: string) =>
      `L’unità ${d} non è disponibile. Se è un’unità di rete mappata, potrebbe essere scollegata, oppure non visibile all’app se avviata come amministratore: ricollegala da Esplora file o usa il percorso di rete (\\\\server\\cartella).`,
    accessDenied: 'Accesso negato: il tuo utente non ha i permessi necessari (lettura o scrittura) su questa cartella. Chiedi i permessi a chi gestisce la cartella di rete.',
    notReady: 'L’unità non è pronta (disco rimovibile o unità di rete non disponibile).',
    inUse: 'Il file è in uso da un altro programma (antivirus, sincronizzazione, un altro PC): riprova tra poco.',
    badNetPath: 'Il computer di rete non è raggiungibile: controlla il nome del server, la connessione di rete o la VPN.',
    netNameDeleted: 'La connessione alla cartella di rete si è interrotta: controlla la rete e riprova.',
    badNetName: 'La cartella condivisa non esiste sul server: controlla il nome della condivisione.',
    logon: 'Credenziali di rete non valide o mancanti: apri la cartella da Esplora file accedendo con utente e password, poi riprova.',
    credConflict: 'Esiste già una connessione a questo server con credenziali diverse: scollegala (es. «net use \\\\server /delete») e riprova.',
    guestBlocked: 'Windows blocca l’accesso alla cartella condivisa senza credenziali (accesso guest): serve un utente e una password per la condivisione.',
    noNetwork: 'Nessuna rete disponibile: controlla la connessione.',
    unreachable: 'La rete o il server non sono raggiungibili: controlla la connessione o la VPN.',
    timeout: 'La cartella di rete non risponde (tempo scaduto): controlla la connessione e riprova.',
    netError: 'Errore di rete imprevisto: riprova tra poco.',
    diskFull: 'Spazio esaurito sulla destinazione.',
    writeProtect: 'La destinazione è protetta da scrittura.',
    tooLong: 'Il percorso è troppo lungo: scegli una cartella con un percorso più corto.',
    invalidName: 'Il percorso non è valido (caratteri non ammessi o formato errato).',
    code: (c: number) => `codice ${c}`,
    rootUnreachable: (root: string) =>
      `Il percorso di rete ${root} non è raggiungibile: controlla il nome del server e della cartella condivisa, la rete o la VPN, e di riuscire ad aprirlo da Esplora file.`,
    notDir: 'Il percorso indicato è un file, non una cartella.',
    notWritable: 'Nella cartella non si può scrivere',
  },
  en: {
    scope: 'The app is not allowed to use this path: choose it again with “Browse”.',
    notFound: 'The folder or file does not exist.',
    pathNotFound: 'The path does not exist.',
    driveMissing: (d: string) =>
      `Drive ${d} is not available. If it is a mapped network drive it may be disconnected, or not visible to the app when it runs as administrator: reconnect it from File Explorer or use the network path (\\\\server\\folder).`,
    accessDenied: 'Access denied: your user lacks the required permissions (read or write) on this folder. Ask whoever manages the network folder for access.',
    notReady: 'The drive is not ready (removable disk or network drive not available).',
    inUse: 'The file is in use by another program (antivirus, sync, another PC): try again shortly.',
    badNetPath: 'The network computer cannot be reached: check the server name, the network connection or the VPN.',
    netNameDeleted: 'The connection to the network folder was interrupted: check the network and try again.',
    badNetName: 'The shared folder does not exist on the server: check the share name.',
    logon: 'Network credentials are invalid or missing: open the folder in File Explorer signing in with user and password, then try again.',
    credConflict: 'There is already a connection to this server with different credentials: disconnect it (e.g. “net use \\\\server /delete”) and try again.',
    guestBlocked: 'Windows blocks access to the shared folder without credentials (guest access): the share needs a user and password.',
    noNetwork: 'No network available: check the connection.',
    unreachable: 'The network or the server cannot be reached: check the connection or the VPN.',
    timeout: 'The network folder does not respond (timed out): check the connection and try again.',
    netError: 'Unexpected network error: try again shortly.',
    diskFull: 'The destination is out of space.',
    writeProtect: 'The destination is write-protected.',
    tooLong: 'The path is too long: choose a folder with a shorter path.',
    invalidName: 'The path is not valid (characters not allowed or wrong format).',
    code: (c: number) => `code ${c}`,
    rootUnreachable: (root: string) =>
      `The network path ${root} cannot be reached: check the server and shared folder names, the network or VPN, and that you can open it in File Explorer.`,
    notDir: 'The path is a file, not a folder.',
    notWritable: 'The folder cannot be written to',
  },
})

/** Radice di un percorso: \\server\condivisione, X:\ oppure / ('' se relativo). */
export function pathRoot(path: string): string {
  const p = path.trim()
  const unc = /^(?:\\\\|\/\/)([^\\/]+)[\\/]+([^\\/]+)/.exec(p)
  if (unc) return `\\\\${unc[1]}\\${unc[2]}`
  const drive = /^([a-z]):/i.exec(p)
  if (drive) return `${drive[1]!.toUpperCase()}:\\`
  return p.startsWith('/') ? '/' : ''
}
export const isNetworkPath = (path: string) => /^(?:\\\\|\/\/)[^\\/]/.test(path.trim())

/** Codici d'errore del sistema (Windows e, dove coincidono, macOS/Linux) → spiegazione. */
function forCode(code: number, path: string): string | null {
  const drive = /^([a-z]):/i.exec(path.trim())?.[0]?.toUpperCase()
  switch (code) {
    case 2:
      return M.notFound
    case 3:
      return drive ? `${M.pathNotFound} ${M.driveMissing(drive)}` : M.pathNotFound
    case 5:
    case 13: // EACCES
      return M.accessDenied
    case 15:
    case 21:
      return drive ? M.driveMissing(drive) : M.notReady
    case 19:
      return M.writeProtect
    case 32:
    case 33:
      return M.inUse
    case 39:
    case 112:
      return M.diskFull
    case 51:
    case 53:
      return M.badNetPath
    case 59:
      return M.netError
    case 64:
      return M.netNameDeleted
    case 67:
      return M.badNetName
    case 86:
    case 1326:
    case 1244:
      return M.logon
    case 121:
    case 110: // ETIMEDOUT (Linux)
    case 60: // ETIMEDOUT (macOS)
      return M.timeout
    case 123:
      return M.invalidName
    case 206:
      return M.tooLong
    case 1219:
      return M.credConflict
    case 1222:
      return M.noNetwork
    case 1231:
    case 1232:
    case 113: // EHOSTUNREACH
      return M.unreachable
    case 1272:
      return M.guestBlocked
    default:
      return null
  }
}

/**
 * Spiega un errore del filesystem. `path` (facoltativo) è il percorso coinvolto:
 * serve a riconoscere le unità mappate. Se l'errore non è noto resta il messaggio originale.
 */
export function explainFsError(e: unknown, path = ''): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/forbidden path|not allowed on the configured scope|not allowed by the scope|fs scope/i.test(raw)) return M.scope
  const code = /os error (\d+)/i.exec(raw)?.[1]
  if (code) {
    const known = forCode(Number(code), path || /([a-z]:\\[^\s]*|\\\\[^\s]+)/i.exec(raw)?.[1] || '')
    if (known) return `${known} (${M.code(Number(code))})`
  }
  return raw
}

/**
 * Verifica una cartella prima di usarla. Restituisce il problema spiegato, o
 * null se va bene. Con `write` controlla anche di poterci scrivere (creando e
 * togliendo un file di prova; se la cartella non esiste ancora, nella prima
 * cartella esistente che la contiene, dove verrà creata).
 */
export async function checkFolder(fs: FsApi, path: string, opts: { write?: boolean } = {}): Promise<string | null> {
  const p = path.trim()
  if (!p) return null
  const root = pathRoot(p)
  try {
    // La radice prima di tutto: un server o un'unità che non risponde si spiega meglio così
    if (root && root !== '/' && !(await fs.exists(root))) {
      return isNetworkPath(p) ? M.rootUnreachable(root) : M.driveMissing(root.slice(0, 2))
    }
    let dir = p.replace(/[\\/]+$/, '') || p
    let exists = await fs.exists(dir)
    if (exists) {
      const st = await fs.stat(dir)
      // stat di una cartella non dice "è un file": si prova a leggerla
      try {
        await fs.listDir(dir)
      } catch (e) {
        if (st && st.size > 0 && /not a directory|os error 267|os error 20\b/i.test(String(e))) return M.notDir
        return explainFsError(e, dir)
      }
    }
    if (!opts.write) return null
    // Prima cartella esistente in cui verrà creata quella indicata
    for (let i = 0; !exists && i < 32; i++) {
      const up = dir.replace(/[\\/]+[^\\/]+$/, '')
      if (!up || up === dir) break
      dir = up
      exists = await fs.exists(dir)
    }
    if (!exists) return null
    const probe = await fs.join(dir, `.pgm-scrittura-${Math.random().toString(36).slice(2, 8)}.tmp`)
    try {
      await fs.createExclusive(probe, 'test')
      await fs.remove(probe)
    } catch (e) {
      return `${M.notWritable}: ${explainFsError(e, dir)}`
    }
    return null
  } catch (e) {
    return explainFsError(e, p)
  }
}
