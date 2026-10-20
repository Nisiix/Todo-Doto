import { beforeEach, describe, expect, it } from 'vitest'
import { createEncryption, isEncryptedBytes, isEncryptedText, unwrapKey, wrapKey } from './vault'
import { WorkspaceStorage } from './storage'
import { getFs } from './fs'
import { useSessionStore } from '@/stores/session'
import { useWorkspaceStore } from '@/stores/workspace'

describe('chiave dati', () => {
  it('si apre solo con la password giusta; riavvolta con una nuova password resta la stessa', async () => {
    const { info, cipher } = await createEncryption('segreto1')
    expect(await unwrapKey(info, 'sbagliata')).toBeNull()
    const again = await unwrapKey(info, 'segreto1')
    const secret = await cipher.encryptText('{"a":1}')
    expect(isEncryptedText(secret)).toBe(true)
    expect(await again!.decryptText(secret)).toBe('{"a":1}')
    const rewrapped = await wrapKey(cipher.raw, 'nuova-pw', true)
    expect(rewrapped.salt).not.toBe(info.salt)
    expect(await (await unwrapKey(rewrapped, 'nuova-pw'))!.decryptText(secret)).toBe('{"a":1}')
    expect(await unwrapKey(rewrapped, 'segreto1')).toBeNull()
  })
  it('cifra anche i byte (copie di sicurezza); due cifrature dello stesso testo sono diverse', async () => {
    const { cipher } = await createEncryption('x')
    const bytes = await cipher.encryptBytes(new Uint8Array([1, 2, 3]))
    expect(isEncryptedBytes(bytes)).toBe(true)
    expect([...(await cipher.decryptBytes(bytes))]).toEqual([1, 2, 3])
    expect(await cipher.encryptText('a')).not.toBe(await cipher.encryptText('a'))
  })
})

describe('workspace di rete cifrato', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  const raw = async (path: string) => (await getFs()).readText(path)

  it('attivazione: tutti i file (tranne workspace.json) diventano illeggibili senza password; tutto continua a funzionare', async () => {
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/sec', name: 'Riservato', mode: 'network', password: 'segreto1' })).ok).toBe(true)
    const p = await ws.createProject({ name: 'Bilancio', description: 'Dati sensibili', folderId: null, members: [] })
    await ws.addItem(p!.id, { title: 'Export XBRL riservato' })
    expect(await raw(`/sec/projects/${p!.id}.json`)).toContain('Export XBRL riservato')

    expect(await ws.setEncryption(true)).toBe(true)
    expect(ws.meta?.encryption?.enabled).toBe(true)
    for (const f of ['users.json', 'tree.json', 'audit.json', `projects/${p!.id}.json`]) {
      const text = await raw(`/sec/${f}`)
      expect(isEncryptedText(text), f).toBe(true)
      expect(text).not.toContain('XBRL')
    }
    expect(isEncryptedText(await raw('/sec/workspace.json'))).toBe(false)
    // Le modifiche successive si scrivono cifrate
    await ws.addItem(p!.id, { title: 'Secondo task' })
    expect(await raw(`/sec/projects/${p!.id}.json`)).not.toContain('Secondo task')
    expect(ws.projects[p!.id]!.items.map((i) => i.title)).toEqual(['Export XBRL riservato', 'Secondo task'])

    // Riapertura: con la password ricordata si legge tutto
    await ws.close()
    const reopened = await ws.open('/sec')
    expect(reopened).toEqual({ ok: true })
    expect(Object.values(ws.projects)[0]!.items).toHaveLength(2)

    // Uno storage senza chiave non legge i progetti
    const bare = await new WorkspaceStorage('/sec').init()
    await expect(bare.readProject(p!.id)).rejects.toThrow('encrypted')
  })

  it('cambio password: la chiave si riavvolge, i dati restano leggibili con la nuova e non con la vecchia', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/sec2', name: 'R', mode: 'network', password: 'segreto1', rememberPassword: false })
    await ws.createProject({ name: 'Alfa', description: '', folderId: null, members: [] })
    await ws.setEncryption(true)
    await ws.changePassword('nuova-pw')
    await ws.close()
    expect((await ws.open('/sec2')).ok).toBe(false)
    expect((await ws.unlock('segreto1', false)).ok).toBe(false)
    expect((await ws.unlock('nuova-pw', false)).ok).toBe(true)
    expect(Object.values(ws.projects).map((x) => x.name)).toEqual(['Alfa'])
  })

  it('copie di sicurezza cifrate e ripristinabili; togliendo la cifratura i file tornano in chiaro', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/sec3', name: 'R', mode: 'network', password: 'segreto1' })
    const p = await ws.createProject({ name: 'Beta', description: '', folderId: null, members: [] })
    await ws.setEncryption(true)
    await ws.createBackupNow()
    const b = ws.backups[0]!
    const bytes = await (await getFs()).readBinary(`/sec3/backups/${b.name}`)
    expect(isEncryptedBytes(bytes)).toBe(true)
    await ws.setEncryption(false)
    expect(isEncryptedText(await raw(`/sec3/projects/${p!.id}.json`))).toBe(false)
    // La copia cifrata si legge ancora (la chiave resta nel workspace)
    expect(await ws.restoreBackup(b.name)).toBe(true)
    expect(Object.values(ws.projects).map((x) => x.name)).toEqual(['Beta'])
  })

  it('un altro PC aperto se ne accorge e continua a leggere; eliminare i dati toglie anche i file cifrati', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/sec4', name: 'R', mode: 'network', password: 'segreto1' })
    const p = await ws.createProject({ name: 'Gamma', description: '', folderId: null, members: [] })
    await ws.setEncryption(true)
    // "Altro PC": un nuovo storage con la sola password
    const other = await new WorkspaceStorage('/sec4').init()
    const meta = await other.readMeta()
    other.setCipher(await unwrapKey(meta.encryption!, 'segreto1'), true)
    expect((await other.readProject(p!.id)).name).toBe('Gamma')
    await ws.close()
    await WorkspaceStorage.deleteData('/sec4')
    expect(await (await getFs()).exists(`/sec4/projects/${p!.id}.json`)).toBe(false)
  })

  it('workspace locale: niente cifratura (non c’è una password)', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/loc', name: 'L', mode: 'local' })
    expect(await ws.setEncryption(true)).toBe(false)
    expect(ws.meta?.encryption).toBeNull()
  })
})
