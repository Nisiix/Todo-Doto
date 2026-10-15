import { describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { WorkspaceStorage } from '@/services/storage'
import { getFs } from '@/services/fs'

/**
 * Copie di sicurezza: automatica una volta al giorno (un solo PC), manuale,
 * rotazione, ripristino di tutto o di un progetto con copia preventiva.
 * I file dei progetti non sono mai nelle copie e non vengono mai toccati.
 */
async function openWs(path = '/dati') {
  await useSessionStore().init()
  const ws = useWorkspaceStore()
  expect((await ws.create({ path, name: 'Studio', mode: 'local' })).ok).toBe(true)
  return ws
}

describe('copie di sicurezza', () => {
  it('la copia automatica si crea una volta al giorno, anche se più PC ci provano', async () => {
    const ws = await openWs()
    await ws.maybeAutoBackup()
    await ws.maybeAutoBackup()
    expect(ws.backups.filter((b) => b.reason === 'auto')).toHaveLength(1)
    // Un altro PC (altra istanza dello storage) prova anche lui: la copia del giorno c'è già
    const other = await new WorkspaceStorage('/dati').init()
    const dir = await other.backupDir(ws.meta!)
    const snapshot = await other.snapshot()
    const created = await other.createBackup(dir, { format: 'pgm-backup', version: 1, createdAt: new Date().toISOString(), createdBy: 'B', host: 'PC2', reason: 'auto', ...snapshot }, true)
    expect(created).toBeNull()
    expect(dir).toBe('/dati/backups')
    expect(ws.backupError).toBeNull()
  })

  it('disattivata: nessuna copia automatica; cartella scelta dall’admin', async () => {
    const ws = await openWs()
    await ws.setBackupSettings({ enabled: false, dir: '' })
    await ws.maybeAutoBackup()
    expect(ws.backups).toHaveLength(0)
    await ws.setBackupSettings({ enabled: true, dir: '/altro-disco/copie' })
    await ws.maybeAutoBackup()
    expect(ws.backups).toHaveLength(1)
    const fs = await getFs()
    expect(await fs.exists(`/altro-disco/copie/${ws.backups[0]!.name}`)).toBe(true)
  })

  it('ripristino di tutto: torna com’era, con una copia dello stato prima del ripristino', async () => {
    const ws = await openWs()
    const fs = await getFs()
    await fs.writeTextAtomic('/progetti/app/README.md', '# app') // la cartella del progetto
    await ws.importProjects([{ name: 'App', path: '/progetti/app' }])
    const app = Object.values(ws.projects)[0]!
    await ws.addItem(app.id, { title: 'Primo' })
    const name = (await ws.createBackupNow())!
    expect(name).toMatch(/-manual\.pgmbackup$/)

    // Dopo la copia: un task in più, un progetto nuovo, un task cancellato per sempre
    const second = await ws.addItem(app.id, { title: 'Secondo' })
    await ws.createProject({ name: 'Nuovo', description: '', folderId: null, members: [] })
    const first = ws.projects[app.id]!.items.find((i) => i.title === 'Primo')!
    await ws.moveItem(app.id, first.id, 'trash')
    await ws.deleteItemForever(app.id, first.id)

    expect(await ws.restoreBackup(name)).toBe(true)
    expect(Object.values(ws.projects).map((p) => p.name)).toEqual(['App'])
    expect(ws.projects[app.id]!.items.map((i) => i.title)).toEqual(['Primo'])
    expect(ws.projects[app.id]!.items.some((i) => i.id === second.id)).toBe(false)
    // Lo stato di prima è salvo in una copia "prima del ripristino"
    expect(ws.backups.some((b) => b.reason === 'prerestore')).toBe(true)
    // La cartella del progetto non è stata toccata
    expect(await fs.readText('/progetti/app/README.md')).toBe('# app')
  })

  it('ripristino di un solo progetto (es. dopo un’eliminazione definitiva)', async () => {
    const ws = await openWs()
    const a = (await ws.createProject({ name: 'A', description: '', folderId: null, members: [] }))!
    const b = (await ws.createProject({ name: 'B', description: '', folderId: null, members: [] }))!
    await ws.addItem(a.id, { title: 'task di A' })
    const name = (await ws.createBackupNow())!
    await ws.addItem(b.id, { title: 'task di B dopo la copia' })
    await ws.trashProject(a.id)
    await ws.deleteProject(a.id)
    expect(ws.projects[a.id]).toBeUndefined()

    expect(await ws.restoreBackup(name, a.id)).toBe(true)
    expect(ws.projects[a.id]!.items.map((i) => i.title)).toEqual(['task di A'])
    // Gli altri progetti restano come sono adesso
    expect(ws.projects[b.id]!.items.map((i) => i.title)).toEqual(['task di B dopo la copia'])
  })

  it('il ripristino è riservato agli amministratori', async () => {
    const ws = await openWs()
    await ws.storage!.mutateMeta((m) => void (m.mode = 'network'))
    const name = (await ws.createBackupNow())!
    await ws.storage!.mutateUsers((f) => void (f.users[0]!.role = 'member'))
    await ws.refresh()
    expect(ws.isAdmin).toBe(false)
    expect(await ws.restoreBackup(name)).toBe(false)
    expect(await ws.createBackupNow()).toBeNull()
  })

  it('la rotazione elimina solo copie dell’app nella cartella delle copie', async () => {
    const ws = await openWs()
    const fs = await getFs()
    await fs.writeTextAtomic('/dati/backups/note-mie.txt', 'non toccare')
    await fs.writeTextAtomic('/dati/backups/pgm-20200101-000000-boh.pgmbackup', 'nome non valido')
    for (let i = 0; i < 12; i++) {
      await ws.createBackupNow()
      await new Promise((r) => setTimeout(r, 2))
    }
    expect(ws.backups.filter((b) => b.reason === 'manual')).toHaveLength(10)
    expect(await fs.readText('/dati/backups/note-mie.txt')).toBe('non toccare')
    expect(await fs.exists('/dati/backups/pgm-20200101-000000-boh.pgmbackup')).toBe(true)
  })
})
