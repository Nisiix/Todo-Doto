/**
 * «Configura questo PC per tutti i miei progetti»: dalle verifiche dei
 * prerequisiti di ogni progetto visibile, un solo elenco di cose da installare.
 *
 * - Lo stesso programma richiesto da più progetti si installa una volta sola.
 * - Versioni diverse dello stesso programma: se possono convivere (Python,
 *   JDK, .NET SDK…) si installano tutte quelle che servono; altrimenti si
 *   sceglie il pacchetto per la versione più alta richiesta, che di solito
 *   soddisfa anche le altre («20+» e «22+» → quello per 22+).
 * - Ciò che l'app non sa installare resta in un elenco «a mano», con i progetti
 *   che lo chiedono (dallo Stack del progetto l'IA locale può cercare il pacchetto).
 *
 * I passi dei singoli progetti (es. npm install) restano nello Stack di
 * ciascuno: dipendono dalla cartella del progetto e dall'utente.
 */
import { catalogPlan, type InstallPlan } from './autoInstall'
import { lookupPrerequisite } from './prerequisites'
import { compareVersions, parseVersion } from './prereqCheck'
import type { ReadinessMissing } from '@/types'

/** Programmi di cui si possono avere più versioni installate insieme. */
const SIDE_BY_SIDE = new Set(['Python', 'Java JDK', '.NET SDK'])

export interface SetupNeed {
  /** Nome del programma (quello del catalogo, se noto). */
  name: string
  /** Versioni richieste dai progetti (vuoto = qualsiasi). */
  required: string[]
  /** Versione trovata su questo PC (se c'è ma è vecchia). */
  found: string
  /** Progetti che lo chiedono. */
  projects: { id: string; name: string }[]
}
export interface SetupInstall extends SetupNeed {
  plan: InstallPlan
}
export interface SetupPlan {
  installs: SetupInstall[]
  manual: SetupNeed[]
}

export interface ProjectMissing {
  project: { id: string; name: string }
  missing: ReadinessMissing[]
}

const canonical = (name: string) => lookupPrerequisite(name)?.name ?? name.trim()
/** Confronto fra versioni richieste ("20+", ">=3.11", ""): la più alta vince, "" è la più bassa. */
const cmpRequired = (a: string, b: string) => compareVersions(parseVersion(a) || '0', parseVersion(b) || '0')

export function planPcSetup(list: ProjectMissing[]): SetupPlan {
  const groups = new Map<string, SetupNeed>()
  for (const { project, missing } of list) {
    for (const x of missing) {
      const name = canonical(x.name)
      const g = groups.get(name) ?? { name, required: [], found: x.found, projects: [] }
      if (!g.required.includes(x.required)) g.required.push(x.required)
      if (!g.projects.some((p) => p.id === project.id)) g.projects.push(project)
      if (!g.found && x.found) g.found = x.found
      groups.set(name, g)
    }
  }
  const installs: SetupInstall[] = []
  const manual: SetupNeed[] = []
  for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    g.required.sort(cmpRequired)
    const versions = SIDE_BY_SIDE.has(g.name) ? g.required : [g.required[g.required.length - 1] ?? '']
    const byId = new Map<string, InstallPlan>()
    for (const v of versions) {
      const plan = catalogPlan({ name: g.name, version: v })
      if (plan && !byId.has(plan.id)) byId.set(plan.id, plan)
    }
    if (!byId.size) {
      manual.push(g)
      continue
    }
    for (const plan of byId.values()) installs.push({ ...g, plan })
  }
  return { installs, manual }
}
