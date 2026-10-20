import { describe, expect, it } from 'vitest'
import { LockBusyError, WorkspaceStorage } from './storage'
import { getFs } from './fs'
import { EMPTY_STACK, MAIL_DEFAULTS, ProjectSchema, type Item, type Project, type UsersFile, type WorkspaceMeta } from '@/types'

const meta: WorkspaceMeta = {
  schema: 1,
  id: 'ws_test',
  name: 'Test',
  mode: 'local',
  createdBy: 'usr_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  auth: null,
  projectsPath: '',
  backup: { enabled: true, dir: '' },
  encryption: null,
  domainLogin: { enabled: false, adminGroups: [], cleanerGroups: [] },
  mail: MAIL_DEFAULTS,
}
const users: UsersFile = {
  users: [{ id: 'usr_1', username: 'a', hostname: 'PC', displayName: 'A', role: 'admin', createdAt: meta.createdAt, sid: '', domain: '', email: '', mailOn: [] }],
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
  milestones: [],
  stack: { ...EMPTY_STACK },
  aiTools: [],
  github: null,
  teams: null,
  nextSeq: 0,
  git: { autoClose: true, handled: [], baselineDone: false },
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
  seq: 0,
  closedByCommit: null,
  blockedBy: [],
  milestoneId: null,
  estimateHours: null,
  checklist: [],
  confirmedAt: null,
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

describe('WorkspaceStorage: eliminazione dei dati', () => {
  it('cancella solo i file di Todo Doto e lascia il resto', async () => {
    const s = await freshWorkspace('/dati')
    await s.writeProject(project('p1'))
    await s.appendAudit([])
    const fs = await getFs()
    await fs.writeTextAtomic('/dati/projects/p1.json.lock', '{}')
    await fs.writeTextAtomic('/dati/appunti.txt', 'non toccare')
    await fs.writeTextAtomic('/progetti/app/package.json', '{}')
    await WorkspaceStorage.deleteData('/dati')
    expect(await WorkspaceStorage.isWorkspace('/dati')).toBe(false)
    for (const f of ['users.json', 'tree.json', 'audit.json', 'projects/p1.json', 'projects/p1.json.lock']) expect(await fs.exists(`/dati/${f}`)).toBe(false)
    expect(await fs.readText('/dati/appunti.txt')).toBe('non toccare')
    expect(await fs.exists('/progetti/app/package.json')).toBe(true)
  })

  it('in projects/ cancella solo i file che sono davvero progetti dell’app', async () => {
    const s = await freshWorkspace('/dati2')
    await s.writeProject(project('prj_a'))
    const fs = await getFs()
    await fs.writeTextAtomic('/dati2/projects/mio.json', '{"nota":"mia"}') // json non dell'app
    await fs.writeTextAtomic('/dati2/projects/altro.json', '{"id":"diverso"}') // id che non corrisponde
    await fs.writeTextAtomic('/dati2/projects/sotto/file.txt', 'x') // sottocartella
    await WorkspaceStorage.deleteData('/dati2')
    expect(await fs.exists('/dati2/projects/prj_a.json')).toBe(false)
    expect(await fs.readText('/dati2/projects/mio.json')).toBe('{"nota":"mia"}')
    expect(await fs.exists('/dati2/projects/altro.json')).toBe(true)
    expect(await fs.exists('/dati2/projects/sotto/file.txt')).toBe(true)
  })

  it('cancella anche gli esiti della configurazione e le copie nella cartella predefinita, solo quelli dell’app', async () => {
    const s = await freshWorkspace('/dati4')
    const fs = await getFs()
    await s.writeReadiness({ userId: 'usr_1', host: 'PC', os: 'windows', updatedAt: '2026-10-15T00:00:00.000Z', projects: {} })
    await fs.writeTextAtomic('/dati4/readiness/appunti.json', '{"mio":true}')
    await fs.writeBinary('/dati4/backups/pgm-20261015-080000-auto.pgmbackup', new Uint8Array([1, 2, 3]))
    await fs.writeTextAtomic('/dati4/backups/leggimi.txt', 'mio')
    await WorkspaceStorage.deleteData('/dati4')
    expect(await fs.exists('/dati4/readiness/usr_1.json')).toBe(false)
    expect(await fs.exists('/dati4/backups/pgm-20261015-080000-auto.pgmbackup')).toBe(false)
    expect(await fs.readText('/dati4/readiness/appunti.json')).toBe('{"mio":true}')
    expect(await fs.readText('/dati4/backups/leggimi.txt')).toBe('mio')
  })

  it('su una cartella che non è un workspace non fa nulla', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/altro/users.json', '{}')
    await WorkspaceStorage.deleteData('/altro')
    expect(await fs.exists('/altro/users.json')).toBe(true)
  })
})

describe('WorkspaceStorage: rilevamento cambiamenti veloce (cartelle di rete)', () => {
  it('se le date delle cartelle non cambiano non si interrogano i singoli file; ogni scrittura le cambia', async () => {
    const fs = await getFs()
    const s = await freshWorkspace('/rapido')
    await s.writeProject({ ...project('prj_a'), name: 'A' })
    // Il filesystem di rete dà alle cartelle la data dell'ultima modifica del loro contenuto
    const original = fs.stat
    let dirTime = 1000
    let fileStats = 0
    fs.stat = async (p: string) => {
      const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
      if (['/rapido', '/rapido/projects', '/rapido/readiness', '/rapido/presence', '/rapido/audit', '/rapido/changes'].includes(n)) return { mtimeMs: dirTime, size: 0 }
      fileStats++
      return original(p)
    }
    try {
      const first = await s.signature()
      expect(fileStats).toBeGreaterThan(0)
      fileStats = 0
      // Nessun cambiamento: solo le richieste per le cartelle, stessa firma
      expect(await s.signature()).toEqual(first)
      expect(fileStats).toBe(0)
      // Una scrittura cambia la data della cartella: si ricalcola tutto e si vede la modifica
      await s.mutateProject('prj_a', 'usr_1', (p) => void (p.name = 'A2'))
      dirTime = 2000
      const after = await s.signature()
      expect(fileStats).toBeGreaterThan(0)
      expect(after['projects/prj_a']).not.toBe(first['projects/prj_a'])
    } finally {
      fs.stat = original
    }
  })
  it('un cambiamento in presence/ rilegge solo quella cartella, non i progetti', async () => {
    const fs = await getFs()
    const s = await freshWorkspace('/sezioni')
    for (const id of ['prj_a', 'prj_b', 'prj_c']) await s.writeProject({ ...project(id), name: id })
    const times: Record<string, number> = { '/sezioni': 1, '/sezioni/projects': 1, '/sezioni/readiness': 1, '/sezioni/presence': 1, '/sezioni/audit': 1, '/sezioni/changes': 1 }
    const original = fs.stat
    const asked: string[] = []
    fs.stat = async (p: string) => {
      const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
      if (n in times) return { mtimeMs: times[n]!, size: 0 }
      asked.push(n)
      return original(p)
    }
    try {
      await s.signature()
      asked.length = 0
      await s.writePresence({ userId: 'usr_1', projectId: 'prj_a', itemId: 'itm_1', since: new Date().toISOString(), beat: new Date().toISOString() })
      times['/sezioni/presence'] = 2
      const sig = await s.signature()
      expect(sig['presence/usr_1']).toBeTruthy()
      expect(asked.some((x) => x.includes('/projects/'))).toBe(false)
      expect(asked.some((x) => x.includes('/presence/'))).toBe(true)
      expect((await s.readAllPresence())['usr_1']?.itemId).toBe('itm_1')
    } finally {
      fs.stat = original
    }
  })
  it('i file si scrivono compatti; quelli formattati delle versioni precedenti si leggono', async () => {
    const fs = await getFs()
    const s = await freshWorkspace('/compatto')
    expect(await fs.readText('/compatto/workspace.json')).not.toContain('\n')
    await fs.writeTextAtomic('/compatto/tree.json', JSON.stringify({ folders: [], labels: [] }, null, 2))
    expect(await s.readTree()).toEqual({ folders: [], labels: [] })
  })
})

describe('WorkspaceStorage: le cancellazioni restano nella cartella Dati', () => {
  it('un id di progetto manomesso non porta fuori dalla cartella projects', async () => {
    const s = await freshWorkspace('/dati3')
    const fs = await getFs()
    await fs.writeTextAtomic('/dati3/workspace-esterno.json', 'non toccare')
    for (const bad of ['../workspace-esterno', '..\\..\\x', 'a/b', 'a.b', '']) {
      await expect(s.deleteProject(bad)).rejects.toThrow(/non valido/)
    }
    expect(await fs.readText('/dati3/workspace-esterno.json')).toBe('non toccare')
    // e un file con nome non valido in projects/ non viene nemmeno elencato
    await fs.writeTextAtomic('/dati3/projects/strano.nome.json', '{}')
    expect(await s.listProjectIds()).not.toContain('strano.nome')
  })

  it('remove non è mai ricorsiva: una cartella con contenuto resta', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/progetto/src/main.ts', 'codice')
    await expect(fs.remove('/progetto')).rejects.toThrow()
    expect(await fs.readText('/progetto/src/main.ts')).toBe('codice')
  })
})

describe('WorkspaceStorage: tanti utenti sulla stessa cartella', () => {
  const entry = (id: string, at: string) => ({ id, at, userId: 'usr_1', action: 'item_created' as const, projectId: 'p', projectName: 'P', itemId: null, itemTitle: null, count: null })

  it('cronologia: ogni PC scrive i suoi file del mese; si leggono insieme al vecchio audit.json; si rilegge solo il file cambiato', async () => {
    const fs = await getFs()
    const a = await freshWorkspace('/cron')
    await a.appendAudit([entry('aud_old', '2026-01-01T00:00:00.000Z')]) // senza scrittore: vecchio formato
    a.setWriter('usr_1', 'PC1')
    const b = await new WorkspaceStorage('/cron').init()
    b.setWriter('usr_2', 'PC2')
    const now = new Date().toISOString()
    await a.appendAudit([entry('aud_a', now)])
    await b.appendAudit([entry('aud_b', now)])
    const names = await fs.readDir('/cron/audit')
    expect(names.sort()).toEqual([`${now.slice(0, 7)}.usr_1-PC1.json`, `${now.slice(0, 7)}.usr_2-PC2.json`])
    const reader = await new WorkspaceStorage('/cron').init()
    expect((await reader.readAudit()).entries.map((e) => e.id)).toEqual(['aud_old', 'aud_a', 'aud_b'])
    // Un'altra voce di PC2: si rilegge solo il suo file
    await b.appendAudit([entry('aud_b2', new Date().toISOString())])
    const original = fs.readText
    const read: string[] = []
    fs.readText = async (p: string) => (read.push(p), original(p))
    try {
      const r = await reader.readAudit([`audit/${now.slice(0, 7)}.usr_2-PC2`])
      expect(r.entries.map((e) => e.id)).toEqual(['aud_old', 'aud_a', 'aud_b', 'aud_b2'])
      expect(read).toEqual([`/cron/audit/${now.slice(0, 7)}.usr_2-PC2.json`])
    } finally {
      fs.readText = original
    }
  })

  it('giornale delle modifiche: chi controlla interroga solo i file scritti dagli altri; senza giornale (versioni precedenti) rilegge tutto', async () => {
    const fs = await getFs()
    const a = await freshWorkspace('/giornale')
    a.setWriter('usr_1', 'PC1')
    for (let i = 0; i < 20; i++) await a.writeProject({ ...project(`prj_${i}`), name: `P${i}` })
    const b = await new WorkspaceStorage('/giornale').init()
    const first = await b.signature()
    await new Promise((r) => setTimeout(r, 3))
    await a.mutateProject('prj_7', 'usr_1', (p) => void (p.name = 'cambiato'))
    // Le date delle cartelle cambiano (nel filesystem in memoria le cartelle non hanno data: la si simula)
    const original = fs.stat
    let tick = 1
    const asked: string[] = []
    fs.stat = async (p: string) => {
      const n = p.replace(/\\/g, '/')
      if (/^\/giornale(\/(projects|readiness|presence|audit|changes))?$/.test(n)) return { mtimeMs: tick, size: 0 }
      asked.push(n)
      return original(p)
    }
    try {
      await b.signature() // prima lettura con le date delle cartelle (completa)
      await new Promise((r) => setTimeout(r, 3))
      await a.mutateProject('prj_3', 'usr_1', (p) => void (p.name = 'di nuovo'))
      tick = 2
      asked.length = 0
      const sig = await b.signature()
      expect(sig['projects/prj_3']).not.toBe(first['projects/prj_3'])
      expect(asked.filter((x) => x.includes('/projects/'))).toEqual(['/giornale/projects/prj_3.json'])
      // Un PC con una versione precedente (nessun giornale): si rilegge la cartella intera
      const old = await new WorkspaceStorage('/giornale').init()
      await new Promise((r) => setTimeout(r, 3))
      await old.mutateProject('prj_5', 'usr_9', (p) => void (p.name = 'vecchia versione'))
      tick = 3
      asked.length = 0
      const sig2 = await b.signature()
      expect(sig2['projects/prj_5']).not.toBe(sig['projects/prj_5'])
      expect(asked.filter((x) => x.includes('/projects/')).length).toBeGreaterThan(10)
    } finally {
      fs.stat = original
    }
  })

  it('progetti grandi: task in capitoli, una modifica riscrive un capitolo solo; le versioni precedenti non possono riscriverli', async () => {
    const fs = await getFs()
    const s = await freshWorkspace('/grande')
    const items = Array.from({ length: 400 }, (_, i) => ({ ...ITEM, id: `itm_${i}`, title: `Task ${i}`, seq: i + 1 }))
    await s.writeProject({ ...project('prj_big'), items, nextSeq: 401 })
    const names = (await fs.readDir('/grande/projects')).sort()
    expect(names.filter((n) => /\.c\d+\.json$/.test(n))).toHaveLength(Math.ceil(400 / 150))
    const meta = JSON.parse(await fs.readText('/grande/projects/prj_big.json'))
    expect(Array.isArray(meta.items)).toBe(false)
    // Un'app di una versione precedente non legge il file (e quindi non lo riscrive perdendo i task)
    expect(() => ProjectSchema.parse(meta)).toThrow()
    // Lettura: tutti i task, nell'ordine
    const read = await s.readProject('prj_big')
    expect(read.items.map((i) => i.id)).toEqual(items.map((i) => i.id))
    // Modifica di un task: si riscrivono il suo capitolo e il file principale
    const writes: string[] = []
    const original = fs.writeTextAtomic
    fs.writeTextAtomic = async (p: string, t: string) => (writes.push(p), original(p, t))
    try {
      await s.mutateProject('prj_big', 'usr_1', (p) => void (p.items.find((i) => i.id === 'itm_42')!.title = 'cambiato'))
    } finally {
      fs.writeTextAtomic = original
    }
    expect(writes.filter((w) => /prj_big\.c\d+\.json$/.test(w))).toHaveLength(1)
    expect(writes).toContain('/grande/projects/prj_big.json')
    expect((await new WorkspaceStorage('/grande').init().then((x) => x.readProject('prj_big'))).items[42]!.title).toBe('cambiato')
    // Firma: i capitoli fanno parte del progetto
    expect(Object.keys(await s.signature()).filter((k) => k.startsWith('projects/prj_big')).length).toBe(4)
    // Quando torna piccolo, un file solo e i capitoli spariscono
    await s.mutateProject('prj_big', 'usr_1', (p) => void (p.items = p.items.slice(0, 50)))
    expect((await fs.readDir('/grande/projects')).filter((n) => n.startsWith('prj_big'))).toEqual(['prj_big.json'])
    expect((await s.readProject('prj_big')).items).toHaveLength(50)
  })

  it('progetti grandi: eliminazione, dati cifrati ed eliminazione dei dati del workspace comprendono i capitoli', async () => {
    const fs = await getFs()
    const s = await freshWorkspace('/grande2')
    const items = Array.from({ length: 320 }, (_, i) => ({ ...ITEM, id: `itm_${i}`, title: `Segreto ${i}`, seq: i + 1 }))
    await s.writeProject({ ...project('prj_a'), items })
    await s.writeProject({ ...project('prj_b'), items })
    const { createEncryption } = await import('./vault')
    const { cipher } = await createEncryption('pw')
    s.setCipher(cipher, true)
    await s.rewriteAll()
    for (const n of (await fs.readDir('/grande2/projects')).filter((x) => x.startsWith('prj_a'))) expect(await fs.readText(`/grande2/projects/${n}`)).not.toContain('Segreto')
    expect((await s.readProject('prj_a')).items).toHaveLength(320)
    await s.deleteProject('prj_a')
    expect((await fs.readDir('/grande2/projects')).filter((n) => n.startsWith('prj_a'))).toEqual([])
    await WorkspaceStorage.deleteData('/grande2')
    expect(await fs.exists('/grande2/projects')).toBe(false)
  })
})
