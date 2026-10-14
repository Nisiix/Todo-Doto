import { describe, expect, it } from 'vitest'
import { WorkspaceStorage } from './storage'
import type { Project, UsersFile, WorkspaceMeta } from '@/types'

const meta: WorkspaceMeta = {
  schema: 1,
  id: 'ws_test',
  name: 'Test',
  mode: 'local',
  createdBy: 'usr_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  auth: null,
}
const users: UsersFile = {
  users: [{ id: 'usr_1', username: 'a', hostname: 'PC', displayName: 'A', role: 'admin', createdAt: meta.createdAt }],
}
const project = (id: string): Project => ({
  schema: 1,
  id,
  name: id,
  description: '',
  folderId: null,
  categoryId: null,
  members: [],
  version: 1,
  createdAt: meta.createdAt,
  createdBy: 'usr_1',
  updatedAt: meta.createdAt,
  updatedBy: 'usr_1',
  trashedAt: null,
  items: [],
  attachmentFolders: [],
  attachments: [],
})

async function freshWorkspace(root = '/ws') {
  const s = await new WorkspaceStorage(root).init()
  await s.create(meta, users)
  return s
}

describe('WorkspaceStorage', () => {
  it('crea i file del workspace e li rilegge validandoli', async () => {
    const s = await freshWorkspace()
    expect(await WorkspaceStorage.isWorkspace('/ws')).toBe(true)
    expect(await WorkspaceStorage.isWorkspace('/altrove')).toBe(false)
    expect((await s.readMeta()).name).toBe('Test')
    expect((await s.readUsers()).users).toHaveLength(1)
    expect(await s.readTree()).toEqual({ folders: [], categories: [], labels: [] })
    expect(await s.listProjectIds()).toEqual([])
  })

  it('scrive, elenca ed elimina i progetti', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    await s.writeProject(project('prj_b'))
    expect((await s.listProjectIds()).sort()).toEqual(['prj_a', 'prj_b'])
    await s.deleteProject('prj_a')
    expect(await s.listProjectIds()).toEqual(['prj_b'])
  })

  it('mutateProject rilegge dal disco, incrementa la versione e registra l’autore', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    // Un "altro PC" modifica il file nel frattempo
    const other = await new WorkspaceStorage('/ws').init()
    await other.mutateProject('prj_a', 'usr_2', (p) => void (p.description = 'dal collega'))

    const result = await s.mutateProject('prj_a', 'usr_1', (p) => void (p.name = 'Rinominato'))
    expect(result.name).toBe('Rinominato')
    expect(result.description).toBe('dal collega') // la modifica del collega non è andata persa
    expect(result.version).toBe(3)
    expect(result.updatedBy).toBe('usr_1')
  })

  it('mutateProject non scrive se la funzione ritorna false', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    const before = await s.signature()
    const r = await s.mutateProject('prj_a', 'usr_1', () => false)
    expect(r.version).toBe(1)
    expect(await s.signature()).toEqual(before)
  })

  it('la firma cambia solo per i file modificati', async () => {
    const s = await freshWorkspace()
    await s.writeProject(project('prj_a'))
    await s.writeProject(project('prj_b'))
    const a = await s.signature()
    await new Promise((r) => setTimeout(r, 2))
    await s.mutateProject('prj_b', 'usr_1', (p) => void (p.name = 'B2'))
    const b = await s.signature()
    expect(b['projects/prj_a']).toBe(a['projects/prj_a'])
    expect(b['projects/prj_b']).not.toBe(a['projects/prj_b'])
    expect(b['tree.json']).toBe(a['tree.json'])
  })

  it('rifiuta un file di progetto non valido', async () => {
    const s = await freshWorkspace()
    await s.writeProject({ ...project('prj_x'), items: [{ bad: true }] } as unknown as Project)
    await expect(s.readProject('prj_x')).rejects.toThrow()
  })
})
