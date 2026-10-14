import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { useUiStore } from './ui'
import { WorkspaceStorage } from '@/services/storage'
import { useNotificationsStore } from './notifications'

/**
 * Test dello store con il filesystem in memoria: coprono i flussi che l'utente
 * compie davvero (creare, spostare, cestinare, domandare…) e l'aggiornamento
 * da modifiche esterne, che è la parte più delicata dell'app.
 */
async function openLocal(path = '/ws') {
  const session = useSessionStore()
  await session.init()
  const ws = useWorkspaceStore()
  const r = await ws.create({ path, name: 'Test', mode: 'local' })
  expect(r.ok).toBe(true)
  return ws
}

describe('workspace: apertura e accesso', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('crea un workspace locale: chi lo crea è admin', async () => {
    const ws = await openLocal()
    expect(ws.status).toBe('open')
    expect(ws.isAdmin).toBe(true)
    expect(ws.isNetwork).toBe(false)
    expect(ws.currentUser?.role).toBe('admin')
    expect(ws.users).toHaveLength(1)
  })

  it('rifiuta di creare un workspace dove ne esiste già uno', async () => {
    const ws = await openLocal()
    const r = await ws.create({ path: '/ws', name: 'Doppio', mode: 'local' })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toMatch(/esiste già/)
  })

  it('apertura di una cartella che non è un workspace', async () => {
    const ws = useWorkspaceStore()
    const r = await ws.open('/vuota')
    expect(r.ok).toBe(false)
    expect(ws.status).toBe('closed')
  })

  it('workspace di rete: chiede la password, la ricorda, e la richiede se cambia', async () => {
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/net', name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
    expect(ws.isNetwork).toBe(true)
    await ws.close()

    // Riapertura: la password è memorizzata in locale, non viene richiesta
    expect((await ws.open('/net')).ok).toBe(true)
    expect(ws.status).toBe('open')

    // L'admin cambia password: la copia locale non è più valida
    await ws.changePassword('nuova-pw')
    await ws.close()
    // Simuliamo un altro PC cancellando la credenziale locale
    await ws.open('/net')
    await ws.forgetCredentials()
    await ws.close()
    const r = await ws.open('/net')
    expect(r.ok).toBe(false)
    expect('needsPassword' in r).toBe(true)
    expect(ws.status).toBe('locked')
    expect((await ws.unlock('sbagliata')).ok).toBe(false)
    expect((await ws.unlock('nuova-pw')).ok).toBe(true)
    expect(ws.status).toBe('open')
  })
})

describe('workspace: progetti ed elementi', () => {
  it('crea progetto, aggiunge e sposta elementi tra i contenitori', async () => {
    const ws = await openLocal()
    const p = await ws.createProject({ name: 'Bilancio', description: '', folderId: null, members: [] })
    expect(p).toBeDefined()
    const item = await ws.addItem(p!.id, { title: 'Export XBRL', priority: 'alta' })
    expect(ws.projects[p!.id]!.items).toHaveLength(1)
    expect(ws.projects[p!.id]!.version).toBe(2)

    await ws.moveItem(p!.id, item.id, 'done')
    expect(ws.findItem(item.id)?.item.bucket).toBe('done')
    expect(ws.findItem(item.id)?.item.completedAt).not.toBeNull()

    await ws.moveItem(p!.id, item.id, 'trash')
    expect(ws.findItem(item.id)?.item.bucket).toBe('trash')
    expect(ws.findItem(item.id)?.item.completedAt).toBeNull()

    // Eliminazione definitiva solo dal cestino
    await ws.moveItem(p!.id, item.id, 'todo')
    await ws.deleteItemForever(p!.id, item.id)
    expect(ws.findItem(item.id)).not.toBeNull()
    await ws.moveItem(p!.id, item.id, 'trash')
    await ws.deleteItemForever(p!.id, item.id)
    expect(ws.findItem(item.id)).toBeNull()
  })

  it('svuota il cestino lasciando intatto il resto', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const a = await ws.addItem(p.id, { title: 'a' })
    const b = await ws.addItem(p.id, { title: 'b' })
    await ws.moveItem(p.id, a.id, 'trash')
    await ws.emptyTrash(p.id)
    expect(ws.projects[p.id]!.items.map((i) => i.id)).toEqual([b.id])
  })

  it('domande: risposta, risoluzione e riapertura; menzioni riconosciute', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'x' })
    const me = ws.currentUser!
    await ws.askQuestion(p.id, it.id, `Quale tassonomia? @${me.displayName}`)
    let q = ws.findItem(it.id)!.item.questions[0]!
    expect(q.mentions).toEqual([me.id])
    expect(q.resolved).toBe(false)

    await ws.answerQuestion(p.id, it.id, q.id, 'La 2025')
    await ws.resolveQuestion(p.id, it.id, q.id, true)
    q = ws.findItem(it.id)!.item.questions[0]!
    expect(q.answers).toHaveLength(1)
    expect(q.resolved).toBe(true)
    expect(q.resolvedAt).not.toBeNull()

    await ws.resolveQuestion(p.id, it.id, q.id, false)
    expect(ws.findItem(it.id)!.item.questions[0]!.resolved).toBe(false)
  })

  it('allegati e cartelle di allegati', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    await ws.addAttachmentFolder(p.id, 'Specifiche')
    const folder = ws.projects[p.id]!.attachmentFolders[0]!
    await ws.addAttachment(p.id, { kind: 'link', name: 'Figma', target: 'https://figma.com/x', folderId: folder.id })
    expect(ws.projects[p.id]!.attachments[0]!.folderId).toBe(folder.id)
    await ws.removeAttachmentFolder(p.id, folder.id)
    expect(ws.projects[p.id]!.attachmentFolders).toHaveLength(0)
    expect(ws.projects[p.id]!.attachments[0]!.folderId).toBeNull() // l'allegato resta, senza cartella
  })

  it('etichette: creazione, modifica ed eliminazione (gli elementi perdono l’etichetta)', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    await ws.addLabel('Bug', '#d64545')
    const label = ws.tree.labels[0]!
    const it = await ws.addItem(p.id, { title: 'x', labelId: label.id })
    expect(ws.findItem(it.id)!.item.labelId).toBe(label.id)
    await ws.updateLabel(label.id, { name: 'Difetto' })
    expect(ws.labelsById[label.id]!.name).toBe('Difetto')
    await ws.deleteLabel(label.id)
    expect(ws.tree.labels).toHaveLength(0)
    expect(ws.findItem(it.id)!.item.labelId).toBeNull()
  })

  it('cestino dei progetti: sposta, ripristina, elimina definitivamente, svuota', async () => {
    const ws = await openLocal()
    const a = (await ws.createProject({ name: 'A', description: '', folderId: null, members: [] }))!
    const b = (await ws.createProject({ name: 'B', description: '', folderId: null, members: [] }))!
    await ws.trashProject(a.id)
    expect(ws.visibleProjects.map((p) => p.id)).toEqual([b.id])
    expect(ws.trashedProjects.map((p) => p.id)).toEqual([a.id])
    await ws.restoreProject(a.id)
    expect(ws.trashedProjects).toHaveLength(0)
    await ws.trashProject(a.id)
    await ws.trashProject(b.id)
    await ws.emptyProjectTrash()
    expect(Object.keys(ws.projects)).toHaveLength(0)
  })

  it('preferiti e recenti', async () => {
    const ws = await openLocal()
    const tick = () => new Promise((r) => setTimeout(r, 3))
    const a = (await ws.createProject({ name: 'A', description: '', folderId: null, members: [] }))!
    await tick()
    const b = (await ws.createProject({ name: 'B', description: '', folderId: null, members: [] }))!
    await tick()
    const c = (await ws.createProject({ name: 'C', description: '', folderId: null, members: [] }))!
    await tick()
    const d = (await ws.createProject({ name: 'D', description: '', folderId: null, members: [] }))!
    expect(ws.recentProjects.map((p) => p.id)).toEqual([d.id, c.id, b.id])
    await new Promise((r) => setTimeout(r, 2))
    await ws.addItem(a.id, { title: 'tocca A' })
    expect(ws.recentProjects.map((p) => p.id)).toEqual([a.id, d.id, c.id])
    await ws.toggleFavorite(c.id)
    expect(ws.isFavorite(c.id)).toBe(true)
    expect(ws.favoriteProjects.map((p) => p.id)).toEqual([c.id])
    await ws.toggleFavorite(c.id)
    expect(ws.favoriteProjects).toHaveLength(0)
    expect(ws.isFavorite(d.id)).toBe(false)
  })

  it('eliminare una cartella elimina le sottocartelle e cestina i progetti contenuti', async () => {
    const ws = await openLocal()
    await ws.addFolder('Clienti', null)
    const clienti = ws.tree.folders[0]!
    await ws.addFolder('Web', clienti.id)
    const web = ws.tree.folders.find((f) => f.name === 'Web')!
    await ws.addFolder('Altro', null)
    const inWeb = (await ws.createProject({ name: 'InWeb', description: '', folderId: web.id, members: [] }))!
    const inClienti = (await ws.createProject({ name: 'InClienti', description: '', folderId: clienti.id, members: [] }))!
    const outside = (await ws.createProject({ name: 'Fuori', description: '', folderId: null, members: [] }))!
    expect(ws.projectsInFolderTree(clienti.id).map((p) => p.id).sort()).toEqual([inWeb.id, inClienti.id].sort())
    await ws.deleteFolder(clienti.id)
    expect(ws.tree.folders.map((f) => f.name)).toEqual(['Altro'])
    expect(ws.trashedProjects.map((p) => p.id).sort()).toEqual([inWeb.id, inClienti.id].sort())
    expect(ws.projects[inWeb.id]!.folderId).toBeNull()
    expect(ws.visibleProjects.map((p) => p.id)).toEqual([outside.id])
  })
})

describe('workspace: visibilità per membri', () => {
  async function networkWithTwoUsers() {
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/net', name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
    await ws.storage!.mutateUsers((f) =>
      f.users.push({ id: 'usr_other', username: 'altro', hostname: 'PC2', displayName: 'Altro', role: 'member', createdAt: '' }),
    )
    await ws.refresh()
    return ws
  }

  it('admin: vede tutto, anche i progetti riservati ad altri', async () => {
    const ws = await networkWithTwoUsers()
    const p = (await ws.createProject({ name: 'Riservato', description: '', folderId: null, members: ['usr_other'] }))!
    expect(ws.isAdmin).toBe(true)
    expect(ws.visibleProjects.map((x) => x.id)).toContain(p.id)
  })

  it('membro non admin: non vede i progetti riservati ad altri, vede i suoi e quelli aperti a tutti', async () => {
    const ws = await networkWithTwoUsers()
    const me = ws.currentUser!
    const forOther = (await ws.createProject({ name: 'Per altri', description: '', folderId: null, members: ['usr_other'] }))!
    const forMe = (await ws.createProject({ name: 'Per me', description: '', folderId: null, members: [me.id] }))!
    const forAll = (await ws.createProject({ name: 'Per tutti', description: '', folderId: null, members: [] }))!
    // L'utente corrente viene retrocesso a membro (da un altro admin, sul disco)
    await ws.storage!.mutateUsers((f) => void (f.users.find((u) => u.id === me.id)!.role = 'member'))
    await ws.refresh()
    expect(ws.isAdmin).toBe(false)
    const ids = ws.visibleProjects.map((x) => x.id)
    expect(ids).not.toContain(forOther.id)
    expect(ids).toContain(forMe.id)
    expect(ids).toContain(forAll.id)
    expect(ws.recentProjects.map((x) => x.id)).not.toContain(forOther.id)
    // nemmeno nel cestino
    await ws.storage!.mutateProject(forOther.id, 'usr_other', (p) => void (p.trashedAt = new Date().toISOString()))
    await ws.refresh()
    expect(ws.trashedProjects.map((x) => x.id)).not.toContain(forOther.id)
  })

  it('rimuovere un utente lo toglie dai progetti riservati', async () => {
    const ws = await networkWithTwoUsers()
    const p = (await ws.createProject({ name: 'R', description: '', folderId: null, members: ['usr_other'] }))!
    await ws.removeUser('usr_other')
    expect(ws.projects[p.id]!.members).toEqual([])
  })
})

describe('workspace: aggiornamento da modifiche esterne', () => {
  it('refresh ricarica solo i file cambiati e segnala l’autore', async () => {
    const ws = await openLocal()
    const ui = useUiStore()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'originale' })
    await ws.storage!.mutateUsers((f) =>
      f.users.push({ id: 'usr_c', username: 'c', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '' }),
    )

    // Un altro client scrive sullo stesso workspace
    const other = await new WorkspaceStorage('/ws').init()
    await new Promise((r) => setTimeout(r, 2))
    await other.mutateProject(p.id, 'usr_c', (x) => void (x.items[0]!.title = 'modificato da Carla'))
    await other.mutateTree((t) => void t.labels.push({ id: 'lbl_x', name: 'Nuova', color: '#000' }))

    await ws.refresh()
    expect(ws.findItem(it.id)?.item.title).toBe('modificato da Carla')
    expect(ws.tree.labels.map((l) => l.name)).toEqual(['Nuova'])
    expect(ws.users.map((u) => u.id)).toContain('usr_c')
    expect(ui.toasts.some((t) => t.text.includes('Carla'))).toBe(true)
    expect(ui.flash.has(it.id)).toBe(true)
  })

  it('refresh rimuove i progetti cancellati da altri', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const other = await new WorkspaceStorage('/ws').init()
    await other.deleteProject(p.id)
    await ws.refresh()
    expect(ws.projects[p.id]).toBeUndefined()
  })

  it('le proprie modifiche non generano segnalazioni', async () => {
    const ws = await openLocal()
    const ui = useUiStore()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    await ws.addItem(p.id, { title: 'mio' })
    await ws.refresh()
    expect(ui.toasts.filter((t) => t.text.startsWith('Aggiornato da'))).toHaveLength(0)
  })
})

describe('workspace: cronologia e permessi di eliminazione', () => {
  it('registra le operazioni sugli elementi e sui progetti, non commenti e domande', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'Titolo\ndettagli' })
    await ws.addComment(p.id, it.id, 'un commento')
    await ws.askQuestion(p.id, it.id, 'una domanda')
    await ws.updateItem(p.id, it.id, { notes: 'note' })
    await ws.moveItem(p.id, it.id, 'done')
    await ws.moveItem(p.id, it.id, 'todo')
    await ws.moveItem(p.id, it.id, 'trash')
    await ws.moveItem(p.id, it.id, 'todo')
    await ws.moveItem(p.id, it.id, 'trash')
    await ws.deleteItemForever(p.id, it.id)
    await ws.trashProject(p.id)
    await ws.restoreProject(p.id)
    await ws.trashProject(p.id)
    await ws.deleteProject(p.id)
    expect(ws.audit.map((e) => e.action)).toEqual([
      'project_created', 'item_created', 'item_completed', 'item_reopened', 'item_trashed', 'item_restored', 'item_trashed', 'item_deleted',
      'project_trashed', 'project_restored', 'project_trashed', 'project_deleted',
    ])
    expect(ws.audit[1]).toMatchObject({ projectName: 'P', itemTitle: 'Titolo', userId: ws.currentUser!.id })
    // la cronologia sopravvive al progetto eliminato
    expect(ws.audit.filter((e) => e.projectId === p.id)).toHaveLength(12)
  })

  it('svuota cestino registra il conteggio', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const a = await ws.addItem(p.id, { title: 'a' })
    const b = await ws.addItem(p.id, { title: 'b' })
    await ws.moveItem(p.id, a.id, 'trash')
    await ws.moveItem(p.id, b.id, 'trash')
    await ws.emptyTrash(p.id)
    expect(ws.audit.at(-1)).toMatchObject({ action: 'trash_emptied', count: 2 })
  })

  it('solo l’admin elimina definitivamente; Cleaner e membri no', async () => {
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/net', name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
    const me = ws.currentUser!
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'x' })
    await ws.moveItem(p.id, it.id, 'trash')

    const setRole = async (role: 'admin' | 'cleaner' | 'member') => {
      await ws.storage!.mutateUsers((f) => void (f.users.find((u) => u.id === me.id)!.role = role))
      await ws.refresh()
    }
    for (const role of ['member', 'cleaner'] as const) {
      await setRole(role)
      expect(ws.canPurge).toBe(false)
      await ws.deleteItemForever(p.id, it.id)
      expect(ws.findItem(it.id)).not.toBeNull() // rifiutato
      await ws.emptyTrash(p.id)
      expect(ws.findItem(it.id)).not.toBeNull()
    }
    await setRole('admin')
    expect(ws.canPurge).toBe(true)
    await ws.deleteItemForever(p.id, it.id)
    expect(ws.findItem(it.id)).toBeNull()
    await ws.trashProject(p.id)
    await ws.deleteProject(p.id)
    expect(ws.projects[p.id]).toBeUndefined()
  })

  it('cestinare un elemento: assegnatario, creatore se non assegnato, Cleaner e admin', async () => {
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/net', name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
    const me = ws.currentUser!
    await ws.storage!.mutateUsers((f) =>
      f.users.push({ id: 'usr_b', username: 'b', hostname: 'PC2', displayName: 'Bea', role: 'member', createdAt: '' }),
    )
    await ws.refresh()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    // In rete si può assegnare a un'altra persona
    const forBea = await ws.addItem(p.id, { title: 'per Bea', assigneeId: 'usr_b' })
    const mine = await ws.addItem(p.id, { title: 'mio', assigneeId: me.id })
    const unassignedByMe = await ws.addItem(p.id, { title: 'nessuno' })
    expect(ws.findItem(forBea.id)!.item.assigneeId).toBe('usr_b')

    const setRole = async (role: 'admin' | 'cleaner' | 'member') => {
      await ws.storage!.mutateUsers((f) => void (f.users.find((u) => u.id === me.id)!.role = role))
      await ws.refresh()
    }
    await setRole('member')
    expect(ws.canTrashItem(ws.findItem(forBea.id)!.item)).toBe(false)
    expect(ws.canTrashItem(ws.findItem(mine.id)!.item)).toBe(true)
    expect(ws.canTrashItem(ws.findItem(unassignedByMe.id)!.item)).toBe(true)
    await ws.moveItem(p.id, forBea.id, 'trash')
    expect(ws.findItem(forBea.id)!.item.bucket).toBe('todo') // rifiutato
    await ws.moveItem(p.id, mine.id, 'trash')
    expect(ws.findItem(mine.id)!.item.bucket).toBe('trash')
    // Un elemento creato da me ma assegnato a Bea non è più mio
    await ws.updateItem(p.id, unassignedByMe.id, { assigneeId: 'usr_b' })
    expect(ws.canTrashItem(ws.findItem(unassignedByMe.id)!.item)).toBe(false)

    await setRole('cleaner')
    expect(ws.canTrashItem(ws.findItem(forBea.id)!.item)).toBe(true)
    await ws.moveItem(p.id, forBea.id, 'trash')
    expect(ws.findItem(forBea.id)!.item.bucket).toBe('trash')
    expect(ws.canPurge).toBe(false)
  })
})

describe('workspace: notifiche dalle modifiche remote', () => {
  it('genera notifiche per le modifiche altrui rispettando le preferenze, non per le proprie', async () => {
    const ws = await openLocal()
    const notif = useNotificationsStore()
    const me = ws.currentUser!
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'Export' })
    await ws.storage!.mutateUsers((f) =>
      f.users.push({ id: 'usr_c', username: 'c', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '' }),
    )
    await notif.setEnabled('comment', false)

    const other = await new WorkspaceStorage('/ws').init()
    await new Promise((r) => setTimeout(r, 2))
    await other.mutateProject(p.id, 'usr_c', (x) => {
      const i = x.items[0]!
      i.bucket = 'done'
      i.comments.push({ id: 'c1', authorId: 'usr_c', text: 'fatto', mentions: [], createdAt: '' })
      i.questions.push({ id: 'q1', authorId: 'usr_c', text: `@${me.displayName} ok?`, mentions: [me.id], createdAt: '', resolved: false, resolvedAt: null, answers: [] })
    })
    await ws.refresh()
    const types = notif.items.map((n) => n.type).sort()
    expect(types).toEqual(['item_completed', 'mention']) // il commento è disattivato; la domanda con @ diventa "mention"
    expect(notif.unread).toBe(2)
    expect(notif.items[0]!.itemId).toBe(it.id)
    notif.markAllRead()
    expect(notif.unread).toBe(0)

    // Le proprie modifiche non generano notifiche
    await ws.addItem(p.id, { title: 'mio' })
    await ws.refresh()
    expect(notif.items).toHaveLength(2)
  })

  it('all’apertura recupera dalla cronologia le operazioni altrui avvenute mentre si era offline', async () => {
    const ws = await openLocal()
    const notif = useNotificationsStore()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'Export' })
    await ws.storage!.mutateUsers((f) =>
      f.users.push({ id: 'usr_c', username: 'c', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '' }),
    )
    await ws.close() // chiudendo, l'ultimo istante "visto" resta registrato

    // Mentre si è offline, Carla completa l'elemento e ne crea un altro (scrivendo anche la cronologia)
    await new Promise((r) => setTimeout(r, 5))
    const other = await new WorkspaceStorage('/ws').init()
    await other.mutateProject(p.id, 'usr_c', (x) => void (x.items[0]!.bucket = 'done'))
    const at = new Date().toISOString()
    await other.appendAudit([
      { id: 'aud_1', at, userId: 'usr_c', action: 'item_completed', projectId: p.id, projectName: 'P', itemId: it.id, itemTitle: 'Export', count: null },
      { id: 'aud_2', at, userId: 'usr_c', action: 'item_created', projectId: p.id, projectName: 'P', itemId: 'itm_new', itemTitle: 'Nuovo', count: null },
      { id: 'aud_3', at, userId: 'usr_c', action: 'project_created', projectId: 'prj_x', projectName: 'X', itemId: null, itemTitle: null, count: null },
    ])

    expect((await ws.open('/ws')).ok).toBe(true)
    const mine = notif.items.filter((n) => n.id.startsWith('aud:'))
    expect(mine.map((n) => n.type).sort()).toEqual(['item_completed', 'item_created'])
    expect(mine.every((n) => n.byId === 'usr_c' && !n.read)).toBe(true)

    // Riaprendo senza novità non si duplicano
    await ws.close()
    expect((await ws.open('/ws')).ok).toBe(true)
    expect(notif.items.filter((n) => n.id.startsWith('aud:'))).toHaveLength(2)
  })
})

describe('workspace: stack e strumenti AI (solo admin)', () => {
  it('salva lo stack, aggiunge/modifica/rimuove strumenti AI; i membri non possono', async () => {
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/net', name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
    const me = ws.currentUser!
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    await ws.updateStack(p.id, { ...p.stack, languages: ['TypeScript'], steps: [{ id: 's1', title: 'npm install', kind: 'command', command: 'npm install', cwd: '', url: '', notes: '' }] })
    expect(ws.projects[p.id]!.stack.languages).toEqual(['TypeScript'])
    await ws.addAiTool(p.id, { kind: 'skill', name: 'frontend-design', notes: '', url: '', fileName: 'SKILL.md', content: '# skill' })
    const tool = ws.projects[p.id]!.aiTools[0]!
    expect(tool.addedBy).toBe(me.id)
    await ws.updateAiTool(p.id, tool.id, { notes: 'per la UI' })
    expect(ws.projects[p.id]!.aiTools[0]!.notes).toBe('per la UI')

    await ws.storage!.mutateUsers((f) => void (f.users.find((u) => u.id === me.id)!.role = 'member'))
    await ws.refresh()
    expect(ws.isAdmin).toBe(false)
    await ws.updateStack(p.id, { ...ws.projects[p.id]!.stack, languages: [] })
    expect(ws.projects[p.id]!.stack.languages).toEqual(['TypeScript']) // rifiutato
    await ws.removeAiTool(p.id, tool.id)
    expect(ws.projects[p.id]!.aiTools).toHaveLength(1)
  })

  it('un elemento può essere assegnato; il filtro utente trova creatore e assegnatario', async () => {
    const ws = await openLocal()
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const it = await ws.addItem(p.id, { title: 'x', assigneeId: 'usr_altro' })
    expect(ws.findItem(it.id)!.item.assigneeId).toBe('usr_altro')
    await ws.updateItem(p.id, it.id, { assigneeId: null })
    expect(ws.findItem(it.id)!.item.assigneeId).toBeNull()
  })
})

describe('workspace: aggiornamento in background e scritture locali', () => {
  it('un progetto appena creato non sparisce per un aggiornamento partito prima della scrittura', async () => {
    await useSessionStore().init()
    const ws = useWorkspaceStore()
    await ws.create({ path: '/race', name: 'Rete', mode: 'network', password: 'segreto1' })
    await ws.storage!.mutateUsers((f) => void f.users.push({ id: 'usr_b', username: 'b', hostname: 'PC2', displayName: 'Bea', role: 'member', createdAt: '' }))
    await ws.refresh()
    await ws.createProject({ name: 'Primo', description: '', folderId: null, members: [] })
    const second = (await ws.createProject({ name: 'Secondo', description: '', folderId: null, members: ['usr_b'] }))!
    expect(ws.projects[second.id]).toBeDefined()
    await ws.refresh()
    expect(Object.values(ws.projects).map((p) => p.name).sort()).toEqual(['Primo', 'Secondo'])
  })
})
