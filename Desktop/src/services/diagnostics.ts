/**
 * Diagnostica locale per «Segnala un problema»: un piccolo registro in memoria
 * degli ultimi errori (console.error, errori non gestiti, salvataggi falliti) e
 * la composizione di un'email con versione, sistema e registro. Niente parte
 * da solo: è l'utente a inviare l'email.
 */
import { APP_NAME, APP_VERSION, SUPPORT_EMAIL } from './branding'
import { isTauri } from './fs'

const MAX_LINES = 50
const lines: string[] = []

export function logDiagnostic(text: string) {
  const stamp = new Date().toISOString().slice(11, 19)
  lines.push(`${stamp} ${text}`.slice(0, 400))
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
}

export const diagnosticLines = () => [...lines]

let installed = false
/** Collega console.error e gli errori non gestiti al registro (una volta sola). */
export function installDiagnostics() {
  if (installed) return
  installed = true
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    logDiagnostic(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '))
    origError(...args)
  }
  window.addEventListener('error', (e) => logDiagnostic(`error: ${e.message} (${e.filename}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    logDiagnostic(`unhandled: ${r instanceof Error ? `${r.name}: ${r.message}` : String(r)}`)
  })
}

async function systemInfo(): Promise<string> {
  if (!isTauri) return `browser ${navigator.userAgent}`
  try {
    const os = await import('@tauri-apps/plugin-os')
    return `${os.platform()} ${os.version()} (${os.arch()}), locale ${(await os.locale()) ?? '?'}`
  } catch {
    return 'sistema sconosciuto'
  }
}

export interface ReportContext {
  workspaceMode: 'local' | 'network' | null
  plan: string
  users: number
  projects: number
}

/** Costruisce un link mailto: con oggetto e corpo precompilati. */
export async function buildReportMailto(ctx: ReportContext): Promise<string> {
  const body = [
    'Descrivi cosa stavi facendo e cosa è successo:',
    '',
    '',
    '---',
    `${APP_NAME} ${APP_VERSION}`,
    `Sistema: ${await systemInfo()}`,
    `Workspace: ${ctx.workspaceMode ?? 'nessuno'} · piano ${ctx.plan} · ${ctx.users} utenti · ${ctx.projects} progetti`,
    'Ultimi errori registrati:',
    ...(lines.length ? lines : ['(nessuno)']),
  ].join('\n')
  const subject = `[${APP_NAME} ${APP_VERSION}] Segnalazione`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
