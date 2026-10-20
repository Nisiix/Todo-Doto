/**
 * «Stack non aggiornato»: i file del progetto (package.json, *.csproj,
 * requirements.txt…) dicono qualcosa di diverso da quello che c'è nello Stack
 * dell'app. Si confronta lo stack salvato con quello che darebbe «Rileva dai
 * file del progetto» (stesse regole: versioni dichiarate dai file, prerequisiti
 * esclusi, cose nuove aggiunte, nulla di scritto a mano tolto) e si elencano le
 * differenze in parole semplici. Non si salva nulla da soli: lo decide
 * l'amministratore con un clic.
 */
import type { DetectedStack } from './projectScan'
import { correctPrerequisites } from './projectScan'
import { mergeStack } from './stackDoc'
import type { Stack } from '@/types'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: {
    version: (n: string, a: string, b: string) => `${n} ${a || 'qualsiasi versione'} → ${b}`,
    removed: (n: string) => `${n} non serve più`,
    added: (n: string, v: string) => `serve ${n}${v ? ` ${v}` : ''}`,
    tech: (n: string) => `usa ${n}`,
    step: (t: string) => `nuovo passo «${t}»`,
    env: (k: string) => `nuova variabile ${k}`,
  },
  en: {
    version: (n: string, a: string, b: string) => `${n} ${a || 'any version'} → ${b}`,
    removed: (n: string) => `${n} no longer needed`,
    added: (n: string, v: string) => `needs ${n}${v ? ` ${v}` : ''}`,
    tech: (n: string) => `uses ${n}`,
    step: (t: string) => `new step “${t}”`,
    env: (k: string) => `new variable ${k}`,
  },
})

export interface StackDrift {
  /** Lo stack come sarebbe aggiornato dai file (cartella del progetto invariata). */
  next: Stack
  /** Differenze, una per voce. */
  changes: string[]
  /** Impronta delle differenze: «Ignora» vale finché non ne compaiono di nuove. */
  signature: string
}

const low = (s: string) => s.trim().toLowerCase()

export function stackDrift(current: Stack, detected: DetectedStack): StackDrift | null {
  const { stack: fixed } = correctPrerequisites(current, detected)
  const { stack: merged } = mergeStack(fixed, detected.stack)
  const next: Stack = { ...merged, sourcePath: current.sourcePath }
  const changes: string[] = []
  for (const p of current.prerequisites) {
    const a = next.prerequisites.find((x) => x.id === p.id)
    if (!a) changes.push(m.removed(p.name))
    else if (a.version !== p.version && a.version) changes.push(m.version(p.name, p.version, a.version))
  }
  for (const a of next.prerequisites) if (!current.prerequisites.some((x) => x.id === a.id)) changes.push(m.added(a.name, a.version))
  const known = new Set([...current.languages, ...current.frameworks].map(low))
  for (const t of [...next.languages, ...next.frameworks]) if (!known.has(low(t))) changes.push(m.tech(t))
  const steps = new Set(current.steps.map((s) => low(s.title)))
  for (const s of next.steps) if (!steps.has(low(s.title))) changes.push(m.step(s.title))
  const env = new Set(current.envVars.map((e) => e.key))
  for (const e of next.envVars) if (!env.has(e.key)) changes.push(m.env(e.key))
  if (!changes.length) return null
  return { next, changes, signature: [...changes].sort().join('|') }
}
