import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { useNotificationsStore } from './notifications'
import { useReadinessStore } from './readiness'
import { WorkspaceStorage } from '@/services/storage'
import { incompleteUsers, prereqsOf } from '@/services/readiness'
import { EMPTY_STACK, type Project } from '@/types'

/**
 * Configurazione dei PC: verifica dei prerequisiti di tutti i progetti, esito
 * condiviso in rete, notifica locale una sola volta per la stessa mancanza.
 * I comandi sono simulati con window.__pgmChecks (come negli E2E).
 */
type Fake = { code: number | null; stdout?: string; stderr?: string }
function fakeChecks(r: Record<string, Fake>) {
  const all = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { stdout: '', stderr: '', timedOut: false, ...v }]))
  Object.assign(window, { __pgmChecks: all })
}
const NODE_MISSING = { 'node -v': { code: 127, stderr: 'node: command not found' } }
const NODE_OK = { 'node -v': { code: 0, stdout: 'v20.11.0' } }

async function setup(mode: 'local' | 'network' = 'network') {
  await useSessionStore().init()
  const ws = useWorkspaceStore()
  const r = await ws.create({ path: '/rete', name: 'Rete', mode, password: 'segreto1' })
  expect(r.ok).toBe(true)
  const p = (await ws.createProject({ name: 'Portale', description: '', folderId: null, members: [] }))!
  await ws.updateStack(p.id, { ...EMPTY_STACK, prerequisites: [{ id: 'pre_node', name: 'Node.js', version: '20+', url: '', check: 'node -v' }] })
  return { ws, p: ws.projects[p.id]!, notif: useNotificationsStore(), readiness: useReadinessStore() }
}

beforeEach(() => fakeChecks(NODE_MISSING))
afterEach(() => delete (window as unknown as { __pgmChecks?: unknown }).__pgmChecks)

describe('configurazione dei PC', () => {
  it('a chi manca qualcosa arriva una notifica, una sola volta per la stessa mancanza', async () => {
    const { notif, readiness, p } = await setup()
    await readiness.runAll(true)
    const setupNotes = () => notif.items.filter((n) => n.type === 'setup_incomplete')
    expect(setupNotes()).toHaveLength(1)
    expect(setupNotes()[0]!.projectId).toBe(p.id)
    expect(setupNotes()[0]!.text).toContain('Node.js non installato')
    expect(setupNotes()[0]!.byId).toBe('') // notifica dell'app, non di un collega

    // Riverificando con la stessa mancanza non si ricrea, nemmeno dopo averla letta o eliminata
    await readiness.runAll(true)
    expect(setupNotes()).toHaveLength(1)
    notif.markAllRead()
    notif.remove(setupNotes()[0]!.id)
    await readiness.runAll(true)
    expect(setupNotes()).toHaveLength(0)
    expect(notif.unread).toBe(0)

    // Sistemato… e poi di nuovo mancante: questa volta si avvisa di nuovo
    fakeChecks(NODE_OK)
    await readiness.runAll(true)
    expect(setupNotes()).toHaveLength(0)
    fakeChecks(NODE_MISSING)
    await readiness.runAll(true)
    expect(setupNotes()).toHaveLength(1)
  })

  it('le notifiche si possono disattivare per tipo', async () => {
    const { notif, readiness } = await setup()
    await notif.setEnabled('setup_incomplete', false)
    await readiness.runAll(true)
    expect(notif.items.filter((n) => n.type === 'setup_incomplete')).toHaveLength(0)
  })

  it('in rete l’esito si condivide nel proprio file; il banner elenca solo chi ha la configurazione incompleta', async () => {
    const { ws, readiness, p } = await setup()
    await readiness.runAll(true)
    const me = ws.currentUser!
    expect(ws.readiness[me.id]!.projects[p.id]!.missing.map((x) => x.name)).toEqual(['Node.js'])

    // Un collega su un altro PC, con Node installato, e un terzo a cui manca: scrivono i loro file
    await ws.storage!.mutateUsers((f) => {
      f.users.push({ id: 'usr_bruno', username: 'bruno', hostname: 'PC2', displayName: 'Bruno', role: 'member', createdAt: '', sid: '', domain: '', email: '', mailOn: [], weeklyHours: 0, absences: [] })
      f.users.push({ id: 'usr_carla', username: 'carla', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '', sid: '', domain: '', email: '', mailOn: [], weeklyHours: 0, absences: [] })
    })
    const other = await new WorkspaceStorage('/rete').init()
    const mine = ws.readiness[me.id]!.projects[p.id]!
    await other.writeReadiness({ userId: 'usr_bruno', host: 'PC2', os: 'windows', updatedAt: mine.checkedAt, projects: { [p.id]: { ...mine, missing: [], ok: 1 } } })
    await other.writeReadiness({ userId: 'usr_carla', host: 'PC3', os: 'windows', updatedAt: mine.checkedAt, projects: { [p.id]: mine } })
    await ws.refresh()
    expect(Object.keys(ws.readiness).sort()).toEqual([me.id, 'usr_bruno', 'usr_carla'].sort())

    const list = (proj: Project) => incompleteUsers(proj.id, prereqsOf(proj), ws.users, ws.readiness, (u) => ws.canUserSee(u, proj)).map((r) => r.user.displayName)
    expect(list(ws.projects[p.id]!).sort()).toEqual([me.displayName, 'Carla'].sort())

    // Progetto limitato a Bruno: Carla non lo vede più, quindi non compare
    await ws.setProjectVisibility(p.id, 'restricted')
    await ws.storage!.mutateProject(p.id, me.id, (x) => void (x.members = ['usr_bruno']))
    await ws.refresh()
    expect(list(ws.projects[p.id]!)).toEqual([me.displayName]) // l'admin vede sempre tutto
  })

  it('il file si riscrive solo se l’esito cambia (per non svegliare gli altri PC)', async () => {
    const { ws, readiness } = await setup()
    await readiness.runAll(true)
    const me = ws.currentUser!.id
    const first = ws.readiness[me]!.updatedAt
    await new Promise((r) => setTimeout(r, 5))
    await readiness.runAll(true)
    expect(ws.readiness[me]!.updatedAt).toBe(first)
    fakeChecks(NODE_OK)
    await readiness.runAll(true)
    expect(ws.readiness[me]!.updatedAt).not.toBe(first)
  })

  it('in locale: notifica sì, nessun file condiviso', async () => {
    const { ws, notif, readiness } = await setup('local')
    await readiness.runAll(true)
    expect(notif.items.some((n) => n.type === 'setup_incomplete')).toBe(true)
    expect(ws.readiness).toEqual({})
    expect(await ws.storage!.readAllReadiness()).toEqual({})
  })
})

describe('notifiche: lette, eliminate, non ricreate', () => {
  it('“segna tutte come lette”, elimina singola e tutte; le notizie eliminate non tornano', async () => {
    await useSessionStore().init()
    const notif = useNotificationsStore()
    notif.load('ws_x', 'usr_me')
    const base = { type: 'setup_incomplete' as const, projectId: 'prj_a', projectName: 'A', itemId: null, itemTitle: '', text: 'x' }
    notif.notifySystem({ ...base, key: 'k1' })
    notif.notifySystem({ ...base, key: 'k2' })
    expect(notif.unread).toBe(2)
    notif.markAllRead()
    expect(notif.unread).toBe(0)
    notif.remove(notif.items[0]!.id)
    expect(notif.items).toHaveLength(1)
    notif.clear()
    expect(notif.items).toHaveLength(0)
    // Ricaricando (riapertura dell'app) le chiavi restano: niente "nuove" che erano già state viste
    notif.load('ws_x', 'usr_me')
    notif.notifySystem({ ...base, key: 'k1' })
    notif.notifySystem({ ...base, key: 'k2' })
    expect(notif.items).toHaveLength(0)
    notif.notifySystem({ ...base, key: 'k3' })
    expect(notif.unread).toBe(1)
  })
})
