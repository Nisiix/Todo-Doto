import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { WorkspaceStorage } from '@/services/storage'
import { getFs } from '@/services/fs'
import { isEncryptedText } from '@/services/vault'

/** «Portatile fuori ufficio»: copia su questo PC e unione al ritorno. */
const setDown = (paths: string[]) => Object.assign(window, { __pgmUnreachable: paths })

async function setup(path: string) {
  const ws = useWorkspaceStore()
  expect((await ws.create({ path, name: 'Studio', mode: 'network', password: 'segreto1' })).ok).toBe(true)
  const p = (await ws.createProject({ name: 'Sito', description: '', folderId: null, members: [] }))!
  const a = (await ws.addItem(p.id, { title: 'Pagina contatti' }))!
  const b = (await ws.addItem(p.id, { title: 'Menu mobile' }))!
  await ws.storage!.mutateUsers((f) => f.users.push({ id: 'usr_c', username: 'carla', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '', sid: '', domain: '', email: '', mailOn: [] }))
  await ws.refresh()
  return { ws, p, a, b }
}
const offlineFiles = async () => {
  const fs = await getFs()
  return (await fs.readDir('/appdata/offline').catch(() => [])).filter((n) => n.endsWith('.json'))
}

describe('portatile fuori ufficio', () => {
  beforeEach(async () => {
    await useSessionStore().init()
    useSessionStore().config.offlineCopy = true
  })
  afterEach(() => setDown([]))

  it('la cartella cade: si continua sulla copia; al ritorno le modifiche si uniscono a quelle dei colleghi', async () => {
    const { ws, p, a, b } = await setup('/rete/off1')
    setDown(['/rete/off1'])
    await ws.updateItem(p.id, a.id, { priority: 'alta' })
    expect(ws.status).toBe('unreachable')
    expect(ws.offlinePending).toBe(1)
    const c = (await ws.addItem(p.id, { title: 'Creato in treno' }))!
    expect(ws.projects[p.id]!.items.map((i) => i.title)).toContain('Creato in treno')

    // Nel frattempo in ufficio Carla cambia un altro task
    setDown([])
    const other = await new WorkspaceStorage('/rete/off1').init()
    await other.mutateProject(p.id, 'usr_c', (x) => void (x.items.find((i) => i.id === b.id)!.title = 'Menu mobile (Carla)'))

    await ws.refresh()
    expect(ws.status).toBe('open')
    expect(ws.offlinePending).toBe(0)
    const remote = await other.readProject(p.id)
    expect(remote.items.find((i) => i.id === a.id)!.priority).toBe('alta')
    expect(remote.items.find((i) => i.id === b.id)!.title).toBe('Menu mobile (Carla)')
    expect(remote.items.find((i) => i.id === c.id)!.title).toBe('Creato in treno')
    await ws.refresh()
    expect(ws.findItem(b.id)!.item.title).toBe('Menu mobile (Carla)')
    expect(ws.offlineReport).toBeNull()
  })

  it('aperto fuori ufficio: si apre la copia (con la password); creare progetti aspetta il ritorno', async () => {
    const { ws, p, a } = await setup('/rete/off2')
    await ws.close()
    expect(await offlineFiles()).not.toHaveLength(0)
    setDown(['/rete/off2'])
    expect(await ws.open('/rete/off2')).toEqual({ ok: true })
    expect(ws.status).toBe('unreachable')
    expect(ws.projects[p.id]!.items).toHaveLength(2)
    await ws.updateItem(p.id, a.id, { title: 'Pagina contatti v2' })
    expect(await ws.createProject({ name: 'Nuovo', description: '', folderId: null, members: [] })).toBeUndefined()

    // Chiusa senza rete e riaperta in ufficio: le modifiche si inviano all'apertura
    await ws.close()
    setDown([])
    expect(await ws.open('/rete/off2')).toEqual({ ok: true })
    const bare = await new WorkspaceStorage('/rete/off2').init()
    bare.setCipher(null, false)
    expect((await bare.readProject(p.id)).items.find((i) => i.id === a.id)!.title).toBe('Pagina contatti v2')
    expect(ws.offlinePending).toBe(0)
  })

  it('stesso campo cambiato da entrambi: resta quello dei colleghi e lo si mostra nel resoconto', async () => {
    const { ws, p, a } = await setup('/rete/off3')
    setDown(['/rete/off3'])
    await ws.updateItem(p.id, a.id, { title: 'Titolo mio' })
    setDown([])
    const other = await new WorkspaceStorage('/rete/off3').init()
    await other.mutateProject(p.id, 'usr_c', (x) => void (x.items[0]!.title = 'Titolo di Carla'))
    await ws.refresh()
    expect(ws.offlineReport?.[0]?.report.conflicts[0]).toMatchObject({ field: 'title', mine: 'Titolo mio', theirs: 'Titolo di Carla' })
  })

  it('workspace cifrato: anche la copia sul PC è cifrata', async () => {
    const { ws, p } = await setup('/rete/off4')
    await ws.setEncryption(true)
    await ws.close()
    const fs = await getFs()
    for (const n of await offlineFiles()) {
      const f = JSON.parse(await fs.readText(`/appdata/offline/${n}`)) as { path: string; body: string }
      if (f.path !== '/rete/off4') continue
      expect(isEncryptedText(f.body)).toBe(true)
      expect(f.body).not.toContain('Pagina contatti')
    }
    setDown(['/rete/off4'])
    expect(await ws.open('/rete/off4')).toEqual({ ok: true })
    expect(ws.projects[p.id]!.items.map((i) => i.title)).toContain('Pagina contatti')
  })

  it('funzione spenta su questo PC: niente copia e niente modifiche senza la cartella', async () => {
    const session = useSessionStore()
    const { ws, p, a } = await setup('/rete/off5')
    await ws.setOfflineCopy(false)
    setDown(['/rete/off5'])
    expect(await ws.updateItem(p.id, a.id, { priority: 'alta' })).toBeUndefined()
    expect(ws.offlinePending).toBe(0)
    await ws.close()
    expect(session.config.offlineCopy).toBe(false)
    const r = await ws.open('/rete/off5')
    expect(r.ok).toBe(false)
  })
})
