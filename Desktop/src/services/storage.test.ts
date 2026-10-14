import { describe, expect, it } from 'vitest'
import { LockBusyError, WorkspaceStorage } from './storage'
import { getFs } from './fs'
import { EMPTY_STACK, type Item, type Project, type UsersFile, type WorkspaceMeta } from '@/types'

const meta: WorkspaceMeta = {
  schema: 1,
  id: 'ws_test',
  name: 'Test',
  mode: 'local',
  createdBy: 'usr_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  auth: null,
}
const users: UsersFile = {
  users: [{ id: 'usr_1', username: 'a', hostname: 'PC', displayName: 'A', role: 'admin', createdAt: meta.createdAt }],
}
const project = (id: string): Project => ({
  schema: 1,
  id,
  name: id,
  description: '',
  folderId: null,
  members: [],
  version: 1,
  createdAt: meta.createdAt,
  createdBy: 'usr_1',
  updatedAt: meta.createdAt,
  updatedBy: 'usr_1',
  trashedAt: null,
  items: [],
  attachmentFolders: [],
  attachments: [],
  stack: { ...EMPTY_STACK },
  aiTools: [],
})

const ITEM: Item = {
  id: '',
  title: '',
  notes: '',
  priority: 'media',
  status: 'da_valutare',
  dueDate: null,
  labelId: null,
  assigneeId: null,
  bucket: 'todo',
  createdAt: meta.createdAt,
  createdBy: 'usr_1',
  completedAt: null,
  trashedAt: null,
  comments: [],
  questions: [],
}

async function freshWorkspace(root = '/ws') {
  const s = await new WorkspaceStorage(root).init()
  await s.create(meta, users)
  return s
}

describe('WorkspaceStorage', () => {
  it('crea i file del workspace e li rilegge validandoli', async () => {
    const s = await freshWorkspace()
    expect(await WorkspaceStorage.isWorkspace('/ws')).toBe(true)
    expect(await WorkspaceStorage.isWorkspace('/altrove')).toBe(false)
    expect((await s.readMeta()).name).toBe('Test')
    expect((await s.readUsers()).users).toHaveLength(1)
    expect(await s.readTree()).toEqual({ folders: [], labels: [] })
    expect(await s.listProjectIds()).toEqual([])
  })

  it('legge un tree.json delle prime versioni scartando le categorie (campo deprecato)', async () => {
    const s = await freshWorkspace()
    const fs = await getFs()
    await fs.writeTextAtomic('/ws/tree.json', JSON.stringify({ folders: [], categories: [{ id: 'cat_1', name: 'Vecchia' }], labels: [] }))
    expect(await s.readTree()).toEqual({ folders: [], labels: [] })
    await s.mutateTree((t) => void t.labels.push({ id: 'lbl_1', name: 'Bug', color: '#f00' }))
    expect(JSON.parse(await fs.readText('/ws/tree.json'))).toEqual({ folders: [], labels: [{ id: 'lbl_1', name: 'Bug', color: '#f00' }] })
  })

  it('scrive, elenca ed elimina i progetti', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    await s.writeProject(project('prj_b'))
    expect((await s.listProjectIds()).sort()).toEqual(['prj_a', 'prj_b'])
    await s.deleteProject('prj_a')
    expect(await s.listProjectIds()).toEqual(['prj_b'])
  })

  it('mutateProject rilegge dal disco, incrementa la versione e registra l’autore', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    // Un "altro PC" modifica il file nel frattempo
    const other = await new WorkspaceStorage('/ws').init()
    await other.mutateProject('prj_a', 'usr_2', (p) => void (p.description = 'dal collega'))

    const result = await s.mutateProject('prj_a', 'usr_1', (p) => void (p.name = 'Rinominato'))
    expect(result.name).toBe('Rinominato')
    expect(result.description).toBe('dal collega') // la modifica del collega non è andata persa
    expect(result.version).toBe(3)
    expect(result.updatedBy).toBe('usr_1')
  })

  it('mutateProject non scrive se la funzione ritorna false', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    const before = await s.signature()
    const r = await s.mutateProject('prj_a', 'usr_1', () => false)
    expect(r.version).toBe(1)
    expect(await s.signature()).toEqual(before)
  })

  it('la firma cambia solo per i file modificati', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    await s.writeProject(project('prj_b'))
    const a = await s.signature()
    await new Promise((r) => setTimeout(r, 2))
    await s.mutateProject('prj_b', 'usr_1', (p) => void (p.name = 'B2'))
    const b = await s.signature()
    expect(b['projects/prj_a']).toBe(a['projects/prj_a'])
    expect(b['projects/prj_b']).not.toBe(a['projects/prj_b'])
    expect(b['tree.json']).toBe(a['tree.json'])
  })

  it('rifiuta un file di progetto non valido', async () => {
    const s = await freshWorkspace()
    await s.writeProject({ ...project('prj_x'), items: [{ bad: true }] } as unknown as Project)
    await expect(s.readProject('prj_x')).rejects.toThrow()
  })
})

describe('WorkspaceStorage: concorrenza e lock', () => {
  /** Due "PC" che aprono la stessa cartella: due istanze indipendenti sullo stesso percorso. */
  async function twoClients(lock?: ConstructorParameters<typeof WorkspaceStorage>[1]) {
    const a = await freshWorkspace()
    await a.writeProject(project('p1'))
    const b = await new WorkspaceStorage('/ws', lock).init()
    a.lockOwner = 'a@PC1'
    b.lockOwner = 'b@PC2'
    return { a, b }
  }
  const addItem = (s: WorkspaceStorage, title: string, actor: string) =>
    s.mutateProject('p1', actor, (p) => {
      p.items.push({ ...ITEM, id: title, title })
    })

  it('controprova: senza lock, letture e scritture intrecciate perdono modifiche', async () => {
    const { a, b } = await twoClients()
    // Il vecchio schema: rilegge, modifica, riscrive, senza nulla in mezzo.
    const unsafe = async (s: WorkspaceStorage, title: string) => {
      const p = await s.readProject('p1')
      p.items.push({ ...ITEM, id: title, title })
      await s.writeProject(p)
    }
    await Promise.all(Array.from({ length: 10 }, (_, i) => unsafe(i % 2 ? a : b, `x${i}`)))
    expect((await a.readProject('p1')).items.length).toBeLessThan(10)
  })

  it('due PC che modificano lo stesso progetto insieme: nessuna modifica persa', async () => {
    const { a, b } = await twoClients()
    await Promise.all(Array.from({ length: 20 }, (_, i) => addItem(i % 2 ? a : b, `i${i}`, i % 2 ? 'usr_a' : 'usr_b')))
    const p = await a.readProject('p1')
    expect(p.items.map((i) => i.id).sort()).toEqual(Array.from({ length: 20 }, (_, i) => `i${i}`).sort())
    expect(p.version).toBe(21)
    expect(await (await getFs()).exists('/ws/projects/p1.json.lock')).toBe(false) // lock rilasciato
  })

  it('nello stesso processo le mutazioni sullo stesso file vanno in coda', async () => {
    const { a } = await twoClients()
    await Promise.all(Array.from({ length: 10 }, (_, i) => addItem(a, `q${i}`, 'usr_a')))
    expect((await a.readProject('p1')).items).toHaveLength(10)
  })

  it('tutti i file condivisi sono protetti: utenti, albero, cronologia, workspace', async () => {
    const { a, b } = await twoClients()
    await Promise.all([
      ...Array.from({ length: 6 }, (_, i) =>
        (i % 2 ? a : b).mutateUsers((u) => void u.users.push({ ...users.users[0]!, id: `u${i}`, username: `u${i}` })),
      ),
      ...Array.from({ length: 6 }, (_, i) => (i % 2 ? a : b).mutateTree((t) => void t.folders.push({ id: `f${i}`, name: `F${i}`, parentId: null, order: i }))),
      ...Array.from({ length: 6 }, (_, i) =>
        (i % 2 ? a : b).appendAudit([{ id: `e${i}`, at: meta.createdAt, userId: 'usr_1', action: 'item_created', projectId: 'p1', projectName: 'p1', itemId: null, itemTitle: null, count: null }]),
      ),
      a.mutateMeta((m) => void (m.name = 'Nuovo nome')),
    ])
    expect((await a.readUsers()).users).toHaveLength(7)
    expect((await a.readTree()).folders).toHaveLength(6)
    expect((await a.readAudit()).entries).toHaveLength(6)
    expect((await a.readMeta()).name).toBe('Nuovo nome')
  })

  it('un lock occupato fa aspettare; se resta tale oltre il timeout il salvataggio fallisce dicendo chi lo tiene', async () => {
    const { b } = await twoClients({ staleMs: 60_000, abandonedMs: 600_000, timeoutMs: 150 })
    const fs = await getFs()
    await fs.writeTextAtomic('/ws/projects/p1.json.lock', JSON.stringify({ token: 't', owner: 'mario@PC3', at: new Date().toISOString() }))
    await expect(addItem(b, 'z', 'usr_b')).rejects.toBeInstanceOf(LockBusyError)
    await expect(addItem(b, 'z', 'usr_b')).rejects.toThrow('mario@PC3')
    // Rilasciato il lock, il salvataggio riesce
    await fs.remove('/ws/projects/p1.json.lock')
    await addItem(b, 'z', 'usr_b')
    expect((await b.readProject('p1')).items.map((i) => i.id)).toEqual(['z'])
  })

  it('un lock abbandonato (crash, rete caduta) viene riconosciuto e rimosso', async () => {
    const { b } = await twoClients({ staleMs: 80, abandonedMs: 600_000, timeoutMs: 5_000 })
    const fs = await getFs()
    // Lock lasciato da un PC che non lo rilascerà mai: resta identico per staleMs
    await fs.writeTextAtomic('/ws/projects/p1.json.lock', JSON.stringify({ token: 'morto', owner: 'x@PC9', at: new Date().toISOString() }))
    const t0 = Date.now()
    await addItem(b, 'dopo-crash', 'usr_b')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(70)
    expect((await b.readProject('p1')).items).toHaveLength(1)
    expect(await fs.exists('/ws/projects/p1.json.lock')).toBe(false)
  })

  it('un lock che dichiara un’età oltre abandonedMs viene rimosso subito', async () => {
    const { b } = await twoClients({ staleMs: 60_000, abandonedMs: 1_000, timeoutMs: 5_000 })
    const fs = await getFs()
    await fs.writeTextAtomic('/ws/projects/p1.json.lock', JSON.stringify({ token: 'vecchio', owner: 'x@PC9', at: '2020-01-01T00:00:00.000Z' }))
    const t0 = Date.now()
    await addItem(b, 'subito', 'usr_b')
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('al rilascio si rimuove solo il proprio lock', async () => {
    const { a } = await twoClients()
    const fs = await getFs()
    // Durante la mutazione il lock viene "rubato" (es. dichiarato abbandonato da un altro PC)
    await a.mutateProject('p1', 'usr_a', () => {
      void fs.writeTextAtomic('/ws/projects/p1.json.lock', JSON.stringify({ token: 'altrui', owner: 'b@PC2', at: new Date().toISOString() }))
    })
    expect(JSON.parse(await fs.readText('/ws/projects/p1.json.lock')).token).toBe('altrui')
  })
})
