import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { PRESENCE_STALE_MS, useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { WorkspaceStorage } from '@/services/storage'
import { getFs } from '@/services/fs'

/** «Chi lavora a cosa»: un file per utente in presence/, letto da tutti. */
async function openNetwork(path: string) {
  const ws = useWorkspaceStore()
  expect((await ws.create({ path, name: 'Ufficio', mode: 'network', password: 'segreto1' })).ok).toBe(true)
  const p = (await ws.createProject({ name: 'Sito', description: '', folderId: null, members: [] }))!
  const a = (await ws.addItem(p.id, { title: 'Pagina contatti' }))!
  const b = (await ws.addItem(p.id, { title: 'Menu mobile' }))!
  await ws.storage!.mutateUsers((f) => f.users.push({ id: 'usr_c', username: 'carla', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '', sid: '', domain: '', email: '', mailOn: [], weeklyHours: 0, absences: [] }))
  await ws.refresh()
  return { ws, p, a, b }
}
const flush = async () => {
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
}

describe('chi lavora a cosa', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('«Ci sto lavorando» si vede su quel task; sceglierne un altro sposta l’indicazione; «Ho smesso» la toglie', async () => {
    const { ws, p, a, b } = await openNetwork('/pr1')
    expect(await ws.setWorkingOn({ projectId: p.id, itemId: a.id })).toBe(true)
    expect(ws.workingByItem[a.id]?.map((e) => e.user.id)).toEqual([ws.currentUser!.id])
    const raw = await (await getFs()).readText(`/pr1/presence/${ws.currentUser!.id}.json`)
    expect(JSON.parse(raw).itemId).toBe(a.id)

    await ws.setWorkingOn({ projectId: p.id, itemId: b.id })
    expect(ws.workingByItem[a.id]).toBeUndefined()
    expect(ws.workingByItem[b.id]).toHaveLength(1)

    await ws.setWorkingOn(null)
    expect(ws.workingEntries).toEqual([])
  })

  it('le indicazioni dei colleghi arrivano con l’aggiornamento; quelle non rinnovate o su task chiusi non si mostrano', async () => {
    const { ws, p, a, b } = await openNetwork('/pr2')
    const other = await new WorkspaceStorage('/pr2').init()
    const now = new Date().toISOString()
    await other.writePresence({ userId: 'usr_c', projectId: p.id, itemId: a.id, since: now, beat: now })
    await ws.refresh()
    expect(ws.workingEntries.map((e) => `${e.user.displayName}:${e.item.title}`)).toEqual(['Carla:Pagina contatti'])

    // PC di Carla spento senza chiudere l'app: oltre il limite l'indicazione scade
    const old = new Date(Date.now() - PRESENCE_STALE_MS - 60_000).toISOString()
    await new Promise((r) => setTimeout(r, 3))
    await other.writePresence({ userId: 'usr_c', projectId: p.id, itemId: a.id, since: old, beat: old })
    await ws.refresh()
    expect(ws.workingEntries).toEqual([])

    // Task completato: nessuna indicazione «fantasma»
    await new Promise((r) => setTimeout(r, 3)) // date dei file diverse (stessa dimensione)
    await other.writePresence({ userId: 'usr_c', projectId: p.id, itemId: b.id, since: now, beat: now })
    await ws.refresh()
    expect(ws.workingByItem[b.id]).toHaveLength(1)
    await ws.moveItem(p.id, b.id, 'done')
    expect(ws.workingByItem[b.id]).toBeUndefined()

    // Utente sconosciuto o file manomesso: ignorato
    await other.writePresence({ userId: 'usr_x', projectId: p.id, itemId: a.id, since: now, beat: now })
    await ws.refresh()
    expect(ws.workingEntries).toEqual([])
  })

  it('completando il proprio task l’indicazione si toglie da sola; chiudendo l’app anche', async () => {
    const { ws, p, a, b } = await openNetwork('/pr3')
    await ws.setWorkingOn({ projectId: p.id, itemId: a.id })
    await ws.moveItem(p.id, a.id, 'done')
    await flush()
    await flush()
    expect(ws.myPresence?.itemId).toBeNull()

    await ws.setWorkingOn({ projectId: p.id, itemId: b.id })
    const me = ws.currentUser!.id
    await ws.close()
    const bare = await new WorkspaceStorage('/pr3').init()
    expect((await bare.readPresence(me))?.itemId).toBeNull()
  })

  it('workspace locale: non serve (si è da soli)', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/prl', name: 'L', mode: 'local' })
    const p = (await ws.createProject({ name: 'P', description: '', folderId: null, members: [] }))!
    const a = (await ws.addItem(p.id, { title: 'x' }))!
    expect(await ws.setWorkingOn({ projectId: p.id, itemId: a.id })).toBe(false)
    expect(await (await getFs()).exists('/prl/presence')).toBe(false)
  })
})
