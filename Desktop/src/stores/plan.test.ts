import { beforeEach, describe, expect, it } from 'vitest'
import * as ed from '@noble/ed25519'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { useUiStore } from './ui'
import { WorkspaceStorage } from '@/services/storage'
import { canonical } from '@/services/license'
import { getFs } from '@/services/fs'
import type { User } from '@/types'

/**
 * Piano, posti, prova e licenza visti dallo store, con il filesystem in
 * memoria: come li vive l'utente (banner, sola lettura, attivazione).
 */

async function openNetwork(path = '/net') {
  const session = useSessionStore()
  await session.init()
  const ws = useWorkspaceStore()
  expect((await ws.create({ path, name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
  return ws
}

/** Aggiunge utenti "da altri PC" scrivendo direttamente users.json, come farebbe un collega. */
async function addColleagues(path: string, n: number) {
  const s = await new WorkspaceStorage(path).init()
  await s.mutateUsers((f) => {
    for (let i = 0; i < n; i++) {
      const u: User = { id: `usr_c${i}`, username: `collega${i}`, hostname: 'PC' + i, displayName: `Collega ${i}`, role: 'member', createdAt: new Date(2026, 0, i + 2).toISOString() }
      f.users.push(u)
    }
  })
}

describe('piano Free e posti', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('workspace locale: Free, ma si scrive sempre', async () => {
    const session = useSessionStore()
    const ws = useWorkspaceStore()
    await ws.create({ path: '/loc', name: 'Locale', mode: 'local' })
    expect(ws.plan.plan).toBe('free')
    expect(ws.canWrite).toBe(true)
    expect(ws.can('export')).toBe(false)
    expect(session.identity.username).toBe('anteprima')
  })

  it('rete: fino a 3 membri tutti scrivono; dal quarto chi non ha posto è in sola lettura', async () => {
    const ws = await openNetwork()
    await addColleagues('/net', 2)
    await ws.refresh()
    expect(ws.users).toHaveLength(3)
    expect(ws.overSeats).toBe(false)
    expect(ws.canWrite).toBe(true)

    await addColleagues('/net', 3)
    await ws.refresh()
    expect(ws.users).toHaveLength(6)
    expect(ws.overSeats).toBe(true)
    // Io sono admin: ho sempre il posto
    expect(ws.hasSeat).toBe(true)
  })

  it('un membro senza posto non può scrivere e riceve un avviso', async () => {
    const ws = await openNetwork()
    await addColleagues('/net', 3)
    // Mi retrocedo a membro arrivato per ultimo: perdo il posto
    const s = await new WorkspaceStorage('/net').init()
    await s.mutateUsers((f) => {
      const me = f.users.find((u) => u.username === 'anteprima')!
      me.role = 'member'
      me.createdAt = '2030-01-01T00:00:00.000Z'
    })
    await ws.refresh()
    expect(ws.hasSeat).toBe(false)
    expect(ws.canWrite).toBe(false)
    const ui = useUiStore()
    const before = Object.keys(ws.projects).length
    await ws.createProject({ name: 'Negato', description: '', folderId: null, categoryId: null, members: [] })
    expect(Object.keys(ws.projects).length).toBe(before)
    expect(ui.toasts.some((t) => t.text.includes('sola lettura'))).toBe(true)
  })

  it('la prova di 14 giorni porta a Team e dà 10 posti; non si può riavviare', async () => {
    const ws = await openNetwork()
    await addColleagues('/net', 4)
    await ws.refresh()
    expect(ws.overSeats).toBe(true)
    await ws.startTrial()
    expect(ws.plan.plan).toBe('team')
    expect(ws.plan.source).toBe('trial')
    expect(ws.plan.trialDaysLeft).toBe(14)
    expect(ws.overSeats).toBe(false)
    expect(ws.can('export')).toBe(true)
    const first = ws.trial!.startedAt
    await ws.startTrial()
    expect(ws.trial!.startedAt).toBe(first)
  })

  it('la prova avviata da un collega viene vista al refresh', async () => {
    const ws = await openNetwork()
    const s = await new WorkspaceStorage('/net').init()
    await s.startTrial('usr_altro')
    await ws.refresh()
    expect(ws.plan.source).toBe('trial')
  })
})

describe('licenza nel workspace', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('una licenza con firma non valida viene rifiutata e segnalata', async () => {
    const ws = await openNetwork()
    const err = await ws.installLicense('{"v":1,"id":"x","plan":"team","seats":10,"issuedTo":"a","email":"b","issuedAt":"2026-01-01","expiresAt":"2027-01-01","sig":"AAAA"}')
    expect(err).toMatch(/firma/)
    expect(ws.plan.plan).toBe('free')
    expect(await ws.installLicense('ciao')).toMatch(/Nessuna licenza/)
  })

  it('un file license.json non valido lasciato nella cartella mantiene Free e spiega perché', async () => {
    const ws = await openNetwork()
    const fs = await getFs()
    await fs.writeTextAtomic('/net/license.json', '{"plan":"business"}')
    await ws.refresh()
    expect(ws.plan.plan).toBe('free')
    expect(ws.licenseError).toMatch(/formato/)
    await fs.writeTextAtomic('/net/license.json', 'non json')
    await ws.refresh()
    expect(ws.plan.plan).toBe('free')
  })

  it('una licenza firmata con una chiave diversa da quella dell’app non vale', async () => {
    const ws = await openNetwork()
    const { secretKey } = await ed.keygenAsync()
    const payload = { v: 1, id: 'lic_1', plan: 'business', seats: null, issuedTo: 'X', email: 'x@y', issuedAt: '2026-01-01', expiresAt: '2027-01-01', order: null }
    const sig = await ed.signAsync(new TextEncoder().encode(canonical(payload)), secretKey)
    const text = JSON.stringify({ ...payload, sig: btoa(String.fromCharCode(...sig)) })
    expect(await ws.installLicense(text)).toMatch(/firma/)
  })

  it('removeLicense torna a Free e il file sparisce', async () => {
    const ws = await openNetwork()
    const fs = await getFs()
    await fs.writeTextAtomic('/net/license.json', '{}')
    await ws.removeLicense()
    expect(await fs.exists('/net/license.json')).toBe(false)
    expect(ws.licenseError).toBeNull()
  })
})

describe('backup', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })

  it('con il piano Free non si creano snapshot; con la prova sì, e si ripristinano', async () => {
    const ws = await openNetwork()
    expect(await ws.createBackupNow()).toBeUndefined()
    await ws.startTrial()
    const p = await ws.createProject({ name: 'Da salvare', description: '', folderId: null, categoryId: null, members: [] })
    const name = await ws.createBackupNow()
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}$/)
    expect(ws.backups).toContain(name)
    // Rovino il progetto, poi ripristino
    await ws.updateProject(p!.id, { name: 'Rovinato' })
    expect(ws.projects[p!.id]!.name).toBe('Rovinato')
    await ws.restoreBackup(name!)
    expect(ws.projects[p!.id]!.name).toBe('Da salvare')
  })
})
