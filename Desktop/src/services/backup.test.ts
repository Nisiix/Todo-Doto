import { describe, expect, it } from 'vitest'
import { autoBackupDue, backupFileName, backupsToDelete, listBackupInfos, packBackup, parseBackupName, unpackBackup, type BackupBundle, type BackupInfo } from './backup'

const at = (y: number, mo: number, d: number, h = 9) => new Date(y, mo - 1, d, h, 0, 0)
const info = (d: Date, reason: BackupInfo['reason'] = 'auto'): BackupInfo => ({ name: backupFileName(d, reason), at: d, reason })

describe('copie di sicurezza: nomi', () => {
  it('il nome si riconosce e contiene data e motivo; altri file no', () => {
    const d = at(2026, 10, 15, 8)
    const name = backupFileName(d, 'manual')
    expect(name).toBe('pgm-20261015-080000-manual.pgmbackup')
    expect(parseBackupName(name)).toEqual({ name, at: d, reason: 'manual' })
    for (const other of ['pgm-20261015-080000-auto.json', 'progetto.pgmbackup', '../pgm-20261015-080000-auto.pgmbackup', 'pgm-20261015-080000-boh.pgmbackup'])
      expect(parseBackupName(other)).toBeNull()
  })

  it('elenco dalla più recente; copia automatica dovuta dopo un giorno', () => {
    const list = listBackupInfos([backupFileName(at(2026, 10, 13), 'auto'), 'note.txt', backupFileName(at(2026, 10, 14), 'manual'), backupFileName(at(2026, 10, 12), 'auto')])
    expect(list.map((b) => b.at.getDate())).toEqual([14, 13, 12])
    expect(autoBackupDue([], at(2026, 10, 15))).toBe(true)
    expect(autoBackupDue(list, at(2026, 10, 13, 20))).toBe(false) // meno di 24 ore dall'ultima automatica
    expect(autoBackupDue(list, at(2026, 10, 14, 9))).toBe(true) // le manuali non contano
  })
})

describe('copie di sicurezza: rotazione', () => {
  it('tiene 7 giornaliere e 4 settimanali delle automatiche, le ultime manuali e pre-ripristino', () => {
    const autos: BackupInfo[] = []
    // Una copia al giorno per 60 giorni, più una seconda copia lo stesso giorno più recente
    for (let i = 0; i < 60; i++) autos.push(info(new Date(2026, 9, 15 - i, 9)))
    autos.push(info(new Date(2026, 9, 15, 7)))
    const manual = Array.from({ length: 12 }, (_, i) => info(new Date(2026, 9, 1 + i, 12), 'manual'))
    const pre = Array.from({ length: 7 }, (_, i) => info(new Date(2026, 9, 1 + i, 13), 'prerestore'))
    const all = [...autos, ...manual, ...pre]
    const del = new Set(backupsToDelete(all).map((b) => b.name))
    const kept = all.filter((b) => !del.has(b.name))
    const keptAuto = kept.filter((b) => b.reason === 'auto').sort((a, b) => b.at.getTime() - a.at.getTime())
    expect(keptAuto).toHaveLength(7 + 4)
    // Le 7 giornaliere sono gli ultimi 7 giorni, una per giorno (la più recente)
    expect(keptAuto.slice(0, 7).map((b) => b.at.getDate())).toEqual([15, 14, 13, 12, 11, 10, 9])
    expect(keptAuto[0]!.at.getHours()).toBe(9)
    // Le settimanali sono di 4 settimane diverse, tutte più vecchie
    const weekly = keptAuto.slice(7)
    expect(new Set(weekly.map((b) => Math.floor(b.at.getTime() / (7 * 86_400_000)))).size).toBe(4)
    expect(weekly.every((b) => b.at < keptAuto[6]!.at)).toBe(true)
    expect(kept.filter((b) => b.reason === 'manual')).toHaveLength(10)
    expect(kept.filter((b) => b.reason === 'prerestore')).toHaveLength(5)
  })

  it('con poche copie non si elimina nulla', () => {
    expect(backupsToDelete([info(at(2026, 10, 15)), info(at(2026, 10, 14)), info(at(2026, 10, 14), 'manual')])).toEqual([])
  })
})

describe('copie di sicurezza: contenuto', () => {
  it('impacchetta e rilegge la copia, validandola', async () => {
    const bundle = {
      format: 'pgm-backup',
      version: 1,
      createdAt: '2026-10-15T08:00:00.000Z',
      createdBy: 'Mario',
      host: 'PC-01',
      reason: 'manual',
      workspace: { schema: 1, id: 'ws_1', name: 'W', mode: 'local', createdBy: 'u', createdAt: '2026-01-01T00:00:00.000Z', auth: null, projectsPath: '', backup: { enabled: true, dir: '' } },
      users: { users: [] },
      tree: { folders: [], labels: [] },
      drive: { schema: 1, rootFolderId: null, rootName: '', syncedAt: null, syncedBy: null, nodes: [] },
      audit: { entries: [] },
      projects: [],
    } as unknown as BackupBundle
    const bytes = await packBackup(bundle)
    const back = await unpackBackup(bytes)
    expect(back.createdBy).toBe('Mario')
    expect(back.workspace.name).toBe('W')
    // Si accetta anche il JSON semplice (dove la compressione non è disponibile)
    expect((await unpackBackup(new TextEncoder().encode(JSON.stringify(bundle)))).host).toBe('PC-01')
    await expect(unpackBackup(new TextEncoder().encode('{"format":"altro"}'))).rejects.toThrow()
  })
})
