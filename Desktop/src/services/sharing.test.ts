import { afterEach, describe, expect, it } from 'vitest'
import { EMPTY_STACK } from '@/types'
import { checkLocalOnly, checkShare, isRemotePath, isUncPath, projectFolderOf, projectParts, projectShareText, workspaceLocalOnlyText, workspaceParts, workspaceShareText } from './sharing'

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

  it('workspace condiviso: la cartella Dati in rete, quella dei progetti anche in locale', async () => {
    drives(['Z:'])
    expect((await checkShare(workspaceParts('Z:\\Dati', 'Z:\\Progetti'))).ok).toBe(true)
    expect((await checkShare(workspaceParts('\\\\server\\Dati', 'Z:\\Progetti'))).ok).toBe(true)
    // Progetti in locale (stesso percorso su ogni PC): va bene
    expect((await checkShare(workspaceParts('Z:\\Dati', 'D:\\Sviluppo'))).ok).toBe(true)
    expect((await checkShare(workspaceParts('\\\\server\\Dati', 'D:\\Sviluppo'))).ok).toBe(true)
    // Dati in locale: no
    const local = await checkShare(workspaceParts('C:\\Dati', 'Z:\\Progetti'))
    expect(local.ok).toBe(false)
    expect(local.local).toEqual([{ part: 'data', path: 'C:\\Dati' }])
    expect(workspaceShareText(local)).toContain('Non è possibile condividere il workspace: la cartella Dati (C:\\Dati) è in locale, su questo PC')
    expect(workspaceShareText(local)).toContain('La cartella dei progetti può stare anche in locale')
    const both = await checkShare(workspaceParts('C:\\Dati', 'D:\\Progetti'))
    expect(both.local).toEqual([{ part: 'data', path: 'C:\\Dati' }])
    expect(workspaceShareText(both)).not.toContain('D:\\Progetti')
    expect(workspaceShareText(await checkShare(workspaceParts('Z:\\Dati', '')))).toContain('manca la cartella dei progetti')
  })

  it('workspace solo su questo PC: entrambe le cartelle in locale', async () => {
    drives(['Z:'])
    expect(await checkLocalOnly(workspaceParts('C:\\Dati', 'D:\\Sviluppo'))).toEqual([])
    expect(workspaceLocalOnlyText([])).toBe('')
    const data = await checkLocalOnly(workspaceParts('Z:\\Dati', 'D:\\Sviluppo'))
    expect(data).toEqual([{ part: 'data', path: 'Z:\\Dati' }])
    expect(workspaceLocalOnlyText(data)).toContain('la cartella Dati (Z:\\Dati) è su un’unità di rete')
    const both = await checkLocalOnly(workspaceParts('\\\\server\\Dati', 'Z:\\Progetti'))
    expect(workspaceLocalOnlyText(both)).toContain('la cartella Dati (\\\\server\\Dati) e la cartella dei progetti (Z:\\Progetti) sono su un’unità di rete')
    expect(workspaceLocalOnlyText(both)).toContain('oppure condividi il workspace in rete')
  })

  it('progetto: la sua cartella (o quella dentro la cartella dei progetti) e la cartella Dati', async () => {
    drives(['Z:'])
    const p = { name: 'Portale', stack: { ...EMPTY_STACK } }
    expect(projectFolderOf(p, 'Z:\\Progetti')).toBe('Z:\\Progetti\\Portale')
    expect(projectFolderOf({ ...p, stack: { ...EMPTY_STACK, sourcePath: 'C:\\Dev\\Portale' } }, 'Z:\\Progetti')).toBe('C:\\Dev\\Portale')
    expect(projectFolderOf(p, '')).toBe('')
    expect((await checkShare(projectParts('Z:\\Dati', 'Z:\\Progetti\\Portale'))).ok).toBe(true)
    // Cartella del progetto in locale: si condivide lo stesso (stesso percorso su ogni PC)
    expect((await checkShare(projectParts('Z:\\Dati', 'C:\\Dev\\Portale'))).ok).toBe(true)
    // Cartella Dati in locale: no
    const local = await checkShare(projectParts('C:\\Dati', 'C:\\Dev\\Portale'))
    expect(projectShareText(local)).toContain('Non è possibile condividere questo progetto con gli altri membri: la cartella Dati (C:\\Dati) è in locale')
    expect(projectShareText(local)).not.toContain('C:\\Dev\\Portale')
    expect(projectShareText(await checkShare(projectParts('Z:\\Dati', '')))).toContain('il progetto non ha una cartella')
    expect(projectShareText(await checkShare(projectParts('Z:\\Dati', 'Z:\\Progetti\\Portale')))).toBe('')
  })
})
