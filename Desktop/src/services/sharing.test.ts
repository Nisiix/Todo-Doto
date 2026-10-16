import { afterEach, describe, expect, it } from 'vitest'
import { EMPTY_STACK } from '@/types'
import { checkShare, isRemotePath, isUncPath, projectFolderOf, projectParts, projectShareText, workspaceParts, workspaceShareText } from './sharing'

const drives = (d: string[] | undefined) => Object.assign(window, { __pgmNetworkDrives: d })
afterEach(() => drives(undefined))

describe('condivisione solo con le cartelle in rete', () => {
  it('riconosce i percorsi di rete', async () => {
    expect(isUncPath('\\\\server\\progetti')).toBe(true)
    expect(isUncPath('//server/progetti')).toBe(true)
    expect(isUncPath('\\\\?\\UNC\\server\\progetti')).toBe(true)
    expect(isUncPath('\\\\?\\C:\\Progetti')).toBe(false)
    expect(isUncPath('C:\\Progetti')).toBe(false)
    expect(await isRemotePath('\\\\server\\progetti')).toBe(true)
    // Unità collegate (simulate nel browser)
    drives(['Z:', '/rete'])
    expect(await isRemotePath('Z:\\Progetti')).toBe(true)
    expect(await isRemotePath('z:/progetti')).toBe(true)
    expect(await isRemotePath('/rete/dati')).toBe(true)
    expect(await isRemotePath('/retexyz')).toBe(false)
    expect(await isRemotePath('C:\\Progetti')).toBe(false)
    expect(await isRemotePath('')).toBe(false)
  })

  it('workspace: servono in rete sia la cartella Dati sia quella dei progetti', async () => {
    drives(['Z:'])
    expect((await checkShare(workspaceParts('Z:\\Dati', 'Z:\\Progetti'))).ok).toBe(true)
    const local = await checkShare(workspaceParts('C:\\Dati', 'Z:\\Progetti'))
    expect(local.ok).toBe(false)
    expect(local.local).toEqual([{ part: 'data', path: 'C:\\Dati' }])
    expect(workspaceShareText(local)).toContain('Non è possibile condividere il workspace: la cartella Dati (C:\\Dati) è in locale, su questo PC')
    const both = await checkShare(workspaceParts('C:\\Dati', 'D:\\Progetti'))
    expect(workspaceShareText(both)).toContain('la cartella Dati (C:\\Dati) e la cartella dei progetti (D:\\Progetti) sono in locale')
  })

  it('progetto: la sua cartella (o quella dentro la cartella dei progetti) e la cartella Dati', async () => {
    drives(['Z:'])
    const p = { name: 'Portale', stack: { ...EMPTY_STACK } }
    expect(projectFolderOf(p, 'Z:\\Progetti')).toBe('Z:\\Progetti\\Portale')
    expect(projectFolderOf({ ...p, stack: { ...EMPTY_STACK, sourcePath: 'C:\\Dev\\Portale' } }, 'Z:\\Progetti')).toBe('C:\\Dev\\Portale')
    expect(projectFolderOf(p, '')).toBe('')
    expect((await checkShare(projectParts('Z:\\Dati', 'Z:\\Progetti\\Portale'))).ok).toBe(true)
    const local = await checkShare(projectParts('Z:\\Dati', 'C:\\Dev\\Portale'))
    expect(projectShareText(local)).toContain('Non è possibile condividere questo progetto con gli altri membri: la cartella del progetto (C:\\Dev\\Portale) è in locale')
    expect(projectShareText(await checkShare(projectParts('Z:\\Dati', '')))).toContain('il progetto non ha una cartella')
    expect(projectShareText(await checkShare(projectParts('Z:\\Dati', 'Z:\\Progetti\\Portale')))).toBe('')
  })
})
