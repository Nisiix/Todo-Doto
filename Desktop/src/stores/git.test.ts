import { afterEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { useGitStore } from './git'
import { getFs } from '@/services/fs'
import type { GitCommit } from '@/services/gitLink'

/**
 * Commit git → task: numeri dei task, chiusura con "chiude TODO-n", ogni
 * commit una volta sola, solo se la cartella del progetto è un repository git.
 * I commit sono simulati con window.__pgmGit (come negli E2E).
 */
const commit = (hash: string, message: string, author = 'Mario'): GitCommit => ({ hash, author, date: '2026-10-15T10:00:00+02:00', message })
function fakeGit(repo: string, commits: GitCommit[]) {
  const w = window as unknown as { __pgmGit?: Record<string, GitCommit[]> }
  w.__pgmGit = { ...(w.__pgmGit ?? {}), [repo]: commits }
}
afterEach(() => delete (window as unknown as { __pgmGit?: unknown }).__pgmGit)

async function setup(withGit = true) {
  await useSessionStore().init()
  const ws = useWorkspaceStore()
  expect((await ws.create({ path: '/dati', name: 'Studio', mode: 'local' })).ok).toBe(true)
  const fs = await getFs()
  await fs.writeTextAtomic('/progetti/app/README.md', '# app')
  if (withGit) await fs.writeTextAtomic('/progetti/app/.git/HEAD', 'ref: refs/heads/main')
  await ws.importProjects([{ name: 'App', path: '/progetti/app' }])
  const id = Object.values(ws.projects)[0]!.id
  return { ws, git: useGitStore(), id, project: () => ws.projects[id]! }
}

describe('commit git → task', () => {
  it('ogni task ha un numero progressivo che non si riusa', async () => {
    const { ws, id, project } = await setup()
    const a = await ws.addItem(id, { title: 'A' })
    const b = await ws.addItem(id, { title: 'B' })
    expect([a.seq, b.seq]).toEqual([1, 2])
    await ws.moveItem(id, b.id, 'trash')
    await ws.deleteItemForever(id, b.id)
    const c = await ws.addItem(id, { title: 'C' })
    expect(c.seq).toBe(3)
    expect(project().items.find((i) => i.id === c.id)!.seq).toBe(3)
  })

  it('“chiude TODO-n” completa il task, una volta sola; riaperto a mano resta aperto', async () => {
    const { ws, git, id, project } = await setup()
    const a = await ws.addItem(id, { title: 'Export XBRL' })
    const b = await ws.addItem(id, { title: 'Login' })

    // Prima lettura: i commit già presenti non chiudono nulla
    fakeGit('/progetti/app', [commit('0ld0001', 'chiude TODO-2 (vecchio, prima della funzione)')])
    await git.scan(project(), true)
    expect(git.hasGit[id]).toBe(true)
    expect(project().items.find((i) => i.id === b.id)!.bucket).toBe('todo')
    expect(project().git.baselineDone).toBe(true)

    // Nuovo commit: chiude TODO-1
    fakeGit('/progetti/app', [commit('a1b2c3d4', 'Export XBRL\n\nchiude TODO-1', 'Anna'), commit('0ld0001', 'chiude TODO-2 (vecchio, prima della funzione)')])
    await git.scan(project(), true)
    const done = project().items.find((i) => i.id === a.id)!
    expect(done.bucket).toBe('done')
    expect(done.closedByCommit).toMatchObject({ hash: 'a1b2c3d4', author: 'Anna', subject: 'Export XBRL' })
    expect(ws.audit.some((e) => e.action === 'item_completed' && e.itemId === a.id)).toBe(true)

    // Riaperto a mano: lo stesso commit non lo richiude, e la nota del commit sparisce
    await ws.moveItem(id, a.id, 'todo')
    expect(project().items.find((i) => i.id === a.id)!.closedByCommit).toBeNull()
    await git.scan(project(), true)
    expect(project().items.find((i) => i.id === a.id)!.bucket).toBe('todo')
    expect(project().items.find((i) => i.id === b.id)!.bucket).toBe('todo')
  })

  it('l’admin può disattivare la chiusura dai commit', async () => {
    const { ws, git, id, project } = await setup()
    const a = await ws.addItem(id, { title: 'A' })
    fakeGit('/progetti/app', [])
    await git.scan(project(), true) // prima lettura
    await ws.setGitAutoClose(id, false)
    fakeGit('/progetti/app', [commit('feed01', 'chiude TODO-1')])
    await git.scan(project(), true)
    expect(project().items.find((i) => i.id === a.id)!.bucket).toBe('todo')
    await ws.setGitAutoClose(id, true)
    await git.scan(project(), true)
    expect(project().items.find((i) => i.id === a.id)!.bucket).toBe('done')
  })

  it('senza .git nella cartella del progetto non succede nulla', async () => {
    const { ws, git, id, project } = await setup(false)
    const a = await ws.addItem(id, { title: 'A' })
    fakeGit('/progetti/app', [commit('feed01', 'chiude TODO-1')])
    await git.scan(project(), true)
    await git.scan(project(), true)
    expect(git.hasGit[id]).toBe(false)
    expect(project().items.find((i) => i.id === a.id)!.bucket).toBe('todo')
    expect(project().git.baselineDone).toBe(false)
  })

  it('i task dei file di versioni precedenti vengono numerati in ordine di creazione', async () => {
    const { ws, id } = await setup()
    // Il progetto importato non ha task: se ne scrive uno "vecchio" direttamente nel file
    const fs = await getFs()
    const path = `/dati/projects/${id}.json`
    const raw = JSON.parse(await fs.readText(path))
    raw.items = [
      { id: 'old_b', title: 'B', bucket: 'todo', createdAt: '2026-01-02T00:00:00.000Z', createdBy: 'u' },
      { id: 'old_a', title: 'A', bucket: 'todo', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u' },
    ]
    delete raw.nextSeq
    await fs.writeTextAtomic(path, JSON.stringify(raw))
    await ws.refresh()
    const p = ws.projects[id]!
    expect(p.items.map((i) => [i.id, i.seq])).toEqual([['old_b', 2], ['old_a', 1]])
    const c = await ws.addItem(id, { title: 'Nuovo' })
    expect(c.seq).toBe(3)
  })
})
