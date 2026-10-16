import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_AI_CONFIG } from '@/types'
import { aiInstallPlan, catalogPlan, isWingetId, wingetAlreadyInstalled, wingetInstallCommand, wingetProgress, wingetShowFound } from './autoInstall'
import { applyPrerequisiteFixes, reviewPrerequisites, suggestPrerequisites, vsForNetFramework } from './prerequisites'

const pre = (name: string, version = '') => ({ id: `pre_${name}`, name, version, url: '', check: '' })

describe('installazione automatica con winget', () => {
  it('pacchetto scelto in base alla versione richiesta', () => {
    expect(catalogPlan(pre('Node.js', '20+'))?.id).toBe('OpenJS.NodeJS.LTS')
    expect(catalogPlan(pre('node', '24+'))?.id).toBe('OpenJS.NodeJS')
    expect(catalogPlan(pre('.NET SDK', '9+'))?.id).toBe('Microsoft.DotNet.SDK.9')
    expect(catalogPlan(pre('.NET SDK', '8.0.204+'))?.id).toBe('Microsoft.DotNet.SDK.8')
    expect(catalogPlan(pre('.NET SDK', '10+'))).toBeNull()
    expect(catalogPlan(pre('Python', '3.13+'))?.id).toBe('Python.Python.3.13')
    expect(catalogPlan(pre('Python', '3.10+'))?.id).toBe('Python.Python.3.12')
    expect(catalogPlan(pre('Java JDK', '17'))?.id).toBe('EclipseAdoptium.Temurin.17.JDK')
    // Visual Studio: 2010+ si soddisfa con il 2022 (con i carichi di lavoro); una versione esatta più vecchia no
    expect(catalogPlan(pre('Visual Studio', '2010+ (Visual Basic Express 2010)'))).toMatchObject({ id: 'Microsoft.VisualStudio.2022.Community', override: expect.stringContaining('ManagedDesktop') })
    expect(catalogPlan(pre('Visual Studio', '2010'))).toBeNull()
    expect(catalogPlan(pre('Visual Studio Build Tools'))?.override).toContain('VCTools')
    expect(catalogPlan(pre('Visual FoxPro 9'))).toBeNull()
    expect(catalogPlan(pre('Strumento sconosciuto'))).toBeNull()
  })

  it('comando winget solo per pacchetti validi; fase e avanzamento dall’output', () => {
    expect(wingetInstallCommand({ name: 'Node.js', id: 'OpenJS.NodeJS.LTS', source: 'catalog' })).toBe(
      'winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity',
    )
    expect(wingetInstallCommand({ name: 'BT', id: 'Microsoft.VisualStudio.2022.BuildTools', override: '--add "X"', source: 'catalog' })).toContain('--override "--add X"')
    expect(wingetInstallCommand({ name: 'Pericolo', id: 'Git.Git & del C:\*', source: 'ai' })).toBeNull()
    expect(isWingetId('Git.Git')).toBe(true)
    expect(isWingetId('Git')).toBe(false)
    expect(isWingetId('Git.Git && calc')).toBe(false)
    // Output di winget (italiano e inglese)
    expect(wingetProgress('Download in corso https://nodejs.org/dist/node.msi')).toEqual({ phase: 'download' })
    expect(wingetProgress('  ██████████▒▒▒▒▒▒  12.0 MB / 30.0 MB')).toEqual({ phase: 'download', pct: 40 })
    expect(wingetProgress('   ▒▒▒▒  45%')).toEqual({ phase: 'download', pct: 45 })
    expect(wingetProgress('Hash del programma di installazione verificato')).toEqual({ phase: 'verify' })
    expect(wingetProgress('Successfully verified installer hash')).toEqual({ phase: 'verify' })
    expect(wingetProgress('Avvio dell’installazione del pacchetto in corso...')).toEqual({ phase: 'install' })
    expect(wingetProgress('Starting package install...')).toEqual({ phase: 'install' })
    expect(wingetProgress('Trovato Node.js LTS [OpenJS.NodeJS.LTS]')).toEqual({})
    expect(wingetAlreadyInstalled(['Trovato un pacchetto esistente già installato.'])).toBe(true)
    expect(wingetAlreadyInstalled(['Found an existing package already installed.'])).toBe(true)
    expect(wingetAlreadyInstalled(['Installazione riuscita'])).toBe(false)
  })

  it('l’IA propone il pacchetto, che vale solo se winget lo conosce', async () => {
    const answer = (wingetId: string, confidence = 'high') =>
      Object.assign(window, { __pgmAi: { request: () => ({ status: 200, body: JSON.stringify({ message: { content: JSON.stringify({ wingetId, confidence }) } }) }) } })
    const cfg = { ...DEFAULT_AI_CONFIG, enabled: true }
    answer('Lazarus.Lazarus')
    expect(await aiInstallPlan(cfg, pre('Lazarus'), async (id) => id === 'Lazarus.Lazarus')).toEqual({ name: 'Lazarus', id: 'Lazarus.Lazarus', source: 'ai' })
    expect(await aiInstallPlan(cfg, pre('Lazarus'), async () => false)).toBeNull()
    answer('Lazarus.Lazarus', 'low')
    expect(await aiInstallPlan(cfg, pre('Lazarus'), async () => true)).toBeNull()
    answer('rm -rf /')
    expect(await aiInstallPlan(cfg, pre('Lazarus'), async () => true)).toBeNull()
    expect(wingetShowFound('Trovato Git [Git.Git]\nVersione: 2.47.1')).toBe(true)
    expect(wingetShowFound('Nessun pacchetto trovato corrispondente ai criteri di input.')).toBe(false)
  })
  afterEach(() => Object.assign(window, { __pgmAi: undefined }))
})

describe('prerequisiti di un progetto .NET Framework (es. Visual Basic Express 2010)', () => {
  const stack = (prerequisites: ReturnType<typeof pre>[], frameworks = ['.NET Framework'], languages = ['C#']) => ({ languages, frameworks, repoUrl: '', prerequisites })

  it('niente .NET SDK né Visual Studio 2022 proposti in automatico', () => {
    const names = suggestPrerequisites(stack([])).map((k) => k.name)
    expect(names).not.toContain('.NET SDK')
    expect(names).toContain('Visual Studio')
    expect(suggestPrerequisites(stack([])).find((k) => k.name === 'Visual Studio')!.version).toBe('')
    // .NET moderno: il .NET SDK serve
    expect(suggestPrerequisites(stack([], ['.NET'])).map((k) => k.name)).toContain('.NET SDK')
    expect(suggestPrerequisites(stack([], ['.NET Framework', 'ASP.NET Core'])).map((k) => k.name)).toContain('.NET SDK')
  })

  it('lo stack salvato prima del riconoscimento preciso si corregge anche senza la cartella (come ApriProgettoVB6)', () => {
    const saved = { ...stack([pre('.NET SDK', '8+'), pre('Visual Studio', '2022')]), steps: [] }
    const fixes = reviewPrerequisites(saved)
    expect(fixes).toEqual([
      { name: '.NET Framework', from: '', to: '4.8', reason: 'missing', because: '.NET Framework' },
      { name: '.NET SDK', from: '8+', to: null, reason: 'classic-dotnet' },
      { name: 'Visual Studio', from: '2022', to: '', reason: 'default-version' },
    ])
    const fixed = applyPrerequisiteFixes(saved, fixes).prerequisites
    expect(fixed.map((p) => [p.name, p.version])).toEqual([['Visual Studio', ''], ['.NET Framework', '4.8']])
    expect(fixed[1]!.url).toContain('dotnet-framework')
    // Con il .NET Framework dichiarato dai file ("4.0+"): la versione minima di Visual Studio per quel framework
    expect(reviewPrerequisites(stack([pre('Visual Studio', '2022'), pre('.NET Framework', '4.0+')]))[0]!.to).toBe('2010+')
    // Il 4.8 proposto dal catalogo non è una dichiarazione: Visual Studio resta senza versione
    expect(reviewPrerequisites(stack([pre('Visual Studio', '2022'), pre('.NET Framework', '4.8')]))[0]!.to).toBe('')
    // Versione dichiarata dai file (2010+): non si tocca; progetto .NET moderno: nessuna correzione
    expect(reviewPrerequisites(stack([pre('Visual Studio', '2010+'), pre('.NET Framework', '4.0+')]))).toEqual([])
    expect(reviewPrerequisites(stack([pre('.NET SDK', '8+'), pre('Visual Studio', '2022')], ['.NET']))).toEqual([])
    // Git: anche quando lo usa un passo (es. git clone), non solo con il repository
    const withClone = { ...stack([], [], ['TypeScript']), prerequisites: [pre('Node.js', '20+')], steps: [{ id: 's', title: 'Clona', kind: 'command' as const, command: 'git clone https://example.com/x.git', cwd: '', url: '', notes: '' }] }
    expect(reviewPrerequisites(withClone)).toEqual([{ name: 'Git', from: '', to: '', reason: 'missing', because: 'git' }])
    expect(vsForNetFramework('4.7.2')).toBe(2017)
    expect(vsForNetFramework('3.5')).toBe(2008)
  })
})
