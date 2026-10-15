/**
 * Workspace di esempio: dati realistici per capire l'app in due minuti,
 * creato nella cartella dati dell'utente (non tocca nessuna cartella scelta
 * dall'utente). Se esiste già viene semplicemente riaperto.
 */
import dayjs from 'dayjs'
import { getFs } from './fs'
import type { useWorkspaceStore } from '@/stores/workspace'
import type { OpenResult } from '@/stores/workspace'

export const DEMO_FOLDER = 'Workspace di esempio'
export const DEMO_NAME = 'Esempio: Studio Rossi'

type Store = ReturnType<typeof useWorkspaceStore>

export async function demoPath() {
  const fs = await getFs()
  return fs.join(await fs.appDataDir(), DEMO_FOLDER)
}

export async function openOrCreateDemo(ws: Store): Promise<OpenResult> {
  const path = await demoPath()
  const fs = await getFs()
  const marker = await fs.join(path, 'workspace.json')
  if (await fs.exists(marker)) return ws.open(path)

  const r = await ws.create({ path, name: DEMO_NAME, mode: 'local' })
  if (!r.ok) return r
  await ws.markAsDemo()
  await populate(ws)
  return { ok: true }
}

const d = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD')

async function populate(ws: Store) {
  await ws.addFolder('Clienti', null)
  await ws.addFolder('Interno', null)
  const clienti = ws.tree.folders.find((f) => f.name === 'Clienti')?.id ?? null
  const interno = ws.tree.folders.find((f) => f.name === 'Interno')?.id ?? null

  await ws.addLabel('Bug', '#d64545')
  await ws.addLabel('Cliente', '#9b7bd6')
  await ws.addLabel('Idea', '#3f9a6a')
  const label = (name: string) => ws.tree.labels.find((l) => l.name === name)?.id ?? null

  // --- Progetto 1: sito web del cliente -------------------------------------
  const web = await ws.createProject({
    name: 'Sito web Bianchi Srl',
    description: 'Rifacimento del sito istituzionale con area riservata per i clienti.',
    folderId: clienti,
    categoryId: null,
    members: [],
  })
  if (web) {
    const a = await ws.addItem(web.id, { title: 'Login con SPID per l’area riservata', priority: 'immediata', status: 'confermato', dueDate: d(3), labelId: label('Cliente') })
    await ws.askQuestion(web.id, a.id, 'Il cliente vuole anche l’accesso con CIE oppure basta SPID?')
    await ws.addComment(web.id, a.id, 'Ho chiesto conferma via email, aspetto risposta entro venerdì.')
    const b = await ws.addItem(web.id, { title: 'Export dei preventivi in PDF', priority: 'alta', status: 'da_definire', dueDate: d(10), notes: 'Usare il modello già approvato per le fatture.' })
    await ws.addComment(web.id, b.id, 'Serve il logo in alta risoluzione: lo chiedo al cliente.')
    await ws.addItem(web.id, { title: 'Il menu non si chiude su mobile', priority: 'alta', status: 'confermato', labelId: label('Bug'), dueDate: d(1) })
    await ws.addItem(web.id, { title: 'Pagina «Lavora con noi»', priority: 'media', status: 'da_valutare', dueDate: d(30) })
    await ws.addItem(web.id, { title: 'Newsletter mensile', priority: 'bassa', status: 'da_valutare', labelId: label('Idea') })
    const done = await ws.addItem(web.id, { title: 'Scelta del template grafico', priority: 'media', status: 'confermato' })
    await ws.moveItem(web.id, done.id, 'done')
    const trash = await ws.addItem(web.id, { title: 'Chat dal vivo sul sito', priority: 'bassa' })
    await ws.moveItem(web.id, trash.id, 'trash')
    await ws.addAttachmentFolder(web.id, 'Specifiche')
    const spec = ws.projects[web.id]?.attachmentFolders[0]?.id ?? null
    await ws.addAttachment(web.id, { kind: 'link', name: 'Mockup Figma', target: 'https://www.figma.com', folderId: spec })
    await ws.addAttachment(web.id, { kind: 'link', name: 'Sito attuale', target: 'https://example.com', folderId: null })
  }

  // --- Progetto 2: gestionale ------------------------------------------------
  const gest = await ws.createProject({
    name: 'Gestionale magazzino',
    description: 'Evoluzioni richieste dal reparto logistica.',
    folderId: clienti,
    categoryId: null,
    members: [],
  })
  if (gest) {
    await ws.addItem(gest.id, { title: 'Lettura codici a barre da tablet', priority: 'alta', status: 'confermato', dueDate: d(14) })
    const q = await ws.addItem(gest.id, { title: 'Report giacenze settimanale', priority: 'media', status: 'da_definire', dueDate: d(21) })
    await ws.askQuestion(gest.id, q.id, 'Il report va inviato per email o basta la stampa dal programma?')
    await ws.addItem(gest.id, { title: 'Scadenza lotti: avviso a 30 giorni', priority: 'alta', status: 'da_valutare', dueDate: d(-2), labelId: label('Cliente') })
    const done = await ws.addItem(gest.id, { title: 'Stampa etichette con nuovo formato', priority: 'media' })
    await ws.moveItem(gest.id, done.id, 'done')
  }

  // --- Progetto 3: interno ---------------------------------------------------
  const interno1 = await ws.createProject({
    name: 'Migrazione server',
    description: 'Passaggio al nuovo server di rete entro fine trimestre.',
    folderId: interno,
    categoryId: null,
    members: [],
  })
  if (interno1) {
    await ws.addItem(interno1.id, { title: 'Copia delle cartelle condivise', priority: 'immediata', status: 'confermato', dueDate: d(5) })
    await ws.addItem(interno1.id, { title: 'Aggiornare le unità mappate sui PC', priority: 'media', status: 'confermato', dueDate: d(7) })
    await ws.addItem(interno1.id, { title: 'Dismettere il vecchio server', priority: 'bassa', status: 'da_definire', dueDate: d(45) })
  }

  const first = Object.values(ws.projects).find((p) => p.name === 'Sito web Bianchi Srl')
  if (first) await ws.toggleFavorite(first.id)
}
