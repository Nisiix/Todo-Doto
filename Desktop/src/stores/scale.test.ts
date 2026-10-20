import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { WorkspaceStorage } from '@/services/storage'
import { ItemSchema } from '@/types'

/** Tanti utenti: progetti in capitoli e cronologia per PC, viste dall'aggiornamento dello store. */
describe('workspace grande', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('un progetto grande modificato da un altro PC si aggiorna; la cronologia degli altri arriva', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/big', name: 'Grande', mode: 'network', password: 'segreto1' })
    const p = (await ws.createProject({ name: 'Archivio', description: '', folderId: null, members: [] }))!
    const other = await new WorkspaceStorage('/rete/big').init()
    other.setWriter('usr_c', 'PC3')
    await other.mutateProject(p.id, 'usr_c', (x) => {
      for (let i = 0; i < 350; i++) x.items.push(ItemSchema.parse({ id: `itm_${i}`, title: `Pratica ${i}`, seq: i + 1, createdAt: new Date().toISOString(), createdBy: 'usr_c' }))
    })
    await ws.refresh()
    expect(ws.projects[p.id]!.items).toHaveLength(350)

    // Dallo store: modifica di un task (un capitolo), poi un altro PC ne modifica un altro
    await ws.updateItem(p.id, 'itm_10', { priority: 'alta' })
    await new Promise((r) => setTimeout(r, 3))
    await other.mutateProject(p.id, 'usr_c', (x) => void (x.items.find((i) => i.id === 'itm_200')!.title = 'Pratica 200 chiusa'))
    await other.appendAudit([{ id: 'aud_c', at: new Date().toISOString(), userId: 'usr_c', action: 'item_completed', projectId: p.id, projectName: 'Archivio', itemId: 'itm_200', itemTitle: 'Pratica 200', count: null }])
    await ws.refresh()
    const items = ws.projects[p.id]!.items
    expect(items.find((i) => i.id === 'itm_10')!.priority).toBe('alta')
    expect(items.find((i) => i.id === 'itm_200')!.title).toBe('Pratica 200 chiusa')
    expect(ws.audit.map((e) => e.id)).toContain('aud_c')
    // La cronologia di questo PC sta nei suoi file del mese
    expect(ws.audit.some((e) => e.action === 'project_created')).toBe(true)
  })
})
