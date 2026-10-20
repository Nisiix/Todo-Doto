import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { inGroup, roleFromGroups } from '@/services/domain'

/** Accesso con l'account di dominio: stessa persona su più PC, ruoli dai gruppi di AD. */
function as(sid: string, user: string, host: string, groups: string[] = []) {
  const s = useSessionStore()
  s.identity = { username: user, hostname: host, domain: 'STUDIO', sid, groups }
}

describe('ruoli dai gruppi', () => {
  it('gruppo con o senza dominio; amministratore prima di cleaner; null senza gruppi indicati', () => {
    expect(inGroup(['STUDIO\\TodoDoto-Admin'], 'tododoto-admin')).toBe(true)
    expect(inGroup(['STUDIO\\TodoDoto-Admin'], 'ALTRO\\TodoDoto-Admin')).toBe(false)
    const dl = { enabled: true, adminGroups: ['TodoDoto-Admin'], cleanerGroups: ['Segreteria'] }
    expect(roleFromGroups(dl, ['STUDIO\\Segreteria', 'STUDIO\\TodoDoto-Admin'])).toBe('admin')
    expect(roleFromGroups(dl, ['STUDIO\\Segreteria'])).toBe('cleaner')
    expect(roleFromGroups(dl, ['STUDIO\\Utenti'])).toBe('member')
    expect(roleFromGroups({ enabled: true, adminGroups: [], cleanerGroups: [] }, ['x'])).toBeNull()
  })
})

describe('accesso con l’account di dominio', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('la stessa persona su un altro PC è lo stesso utente', async () => {
    as('S-1-5-21-1-1001', 'mario', 'PC-UFFICIO', ['STUDIO\\TodoDoto-Admin'])
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/dom1', name: 'Studio', mode: 'network', password: 'segreto1' })
    expect(await ws.setDomainLogin({ enabled: true, adminGroups: [], cleanerGroups: [] })).toBe('ok')
    const me = ws.currentUser!
    expect(me.sid).toBe('S-1-5-21-1-1001')
    await ws.close()
    // Portatile: altro nome del PC, stesso account
    as('S-1-5-21-1-1001', 'mario', 'PORTATILE-MARIO')
    expect((await ws.open('/rete/dom1', { password: 'segreto1' })).ok).toBe(true)
    expect(ws.currentUser?.id).toBe(me.id)
    expect(ws.users).toHaveLength(1)
  })

  it('ruoli dai gruppi: chi è nel gruppo diventa amministratore, chi non c’è torna membro (mai l’ultimo amministratore)', async () => {
    as('S-1-5-21-1-1001', 'mario', 'PC1', ['STUDIO\\TodoDoto-Admin'])
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/dom2', name: 'Studio', mode: 'network', password: 'segreto1' })
    // Chi lo attiva deve far parte di un gruppo degli amministratori
    expect(await ws.setDomainLogin({ enabled: true, adminGroups: ['Direzione'], cleanerGroups: [] })).toBe('notInAdminGroup')
    expect(await ws.setDomainLogin({ enabled: true, adminGroups: ['TodoDoto-Admin'], cleanerGroups: ['Segreteria'] })).toBe('ok')
    await ws.close()

    // Carla, nuova, è in Segreteria: entra come Cleaner
    as('S-1-5-21-1-1002', 'carla', 'PC2', ['STUDIO\\Segreteria'])
    await ws.open('/rete/dom2', { password: 'segreto1' })
    expect(ws.currentUser?.role).toBe('cleaner')
    await ws.close()

    // Carla passa nel gruppo degli amministratori: al prossimo accesso è amministratore
    as('S-1-5-21-1-1002', 'carla', 'PC2', ['STUDIO\\TodoDoto-Admin'])
    await ws.open('/rete/dom2', { password: 'segreto1' })
    expect(ws.currentUser?.role).toBe('admin')
    await ws.close()

    // Mario esce dal gruppo: torna membro (c'è ancora Carla come amministratore)
    as('S-1-5-21-1-1001', 'mario', 'PC1', [])
    await ws.open('/rete/dom2', { password: 'segreto1' })
    expect(ws.currentUser?.role).toBe('member')
  })

  it('senza un account di dominio su questo PC non si attiva', async () => {
    useSessionStore().identity = { username: 'locale', hostname: 'PC' }
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/dom3', name: 'Studio', mode: 'network', password: 'segreto1' })
    expect(await ws.setDomainLogin({ enabled: true, adminGroups: [], cleanerGroups: [] })).toBe('noDomain')
    expect(ws.meta?.domainLogin.enabled).toBe(false)
  })
})
