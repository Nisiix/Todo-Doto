import { describe, expect, it } from 'vitest'
import { EMPTY_STACK, type Stack } from '@/types'
import { mergeImportedStack, parseStackMarkdown } from './stackDoc'
import { autofillPrerequisite, lookupPrerequisite, suggestPrerequisites } from './prerequisites'
import { scaffoldFiles } from './scaffold'

const stack = (over: Partial<Stack> = {}): Stack => ({ ...EMPTY_STACK, ...over })
const doc = (content: string) => ({ fileName: 'ARCHITETTURA.md', content, importedAt: '2026-10-14T00:00:00.000Z' })

describe('prerequisiti: catalogo', () => {
  it('riconosce nomi e alias senza badare a maiuscole e punteggiatura', () => {
    expect(lookupPrerequisite('nodejs')?.name).toBe('Node.js')
    expect(lookupPrerequisite('Node JS')?.name).toBe('Node.js')
    expect(lookupPrerequisite('dotnet')?.name).toBe('.NET SDK')
    expect(lookupPrerequisite('Sconosciuto')).toBeNull()
  })

  it('completa solo i campi vuoti e usa il nome canonico', () => {
    const p = { name: 'node', version: '22', url: '', check: '' }
    expect(autofillPrerequisite(p)).toBe(true)
    expect(p).toEqual({ name: 'Node.js', version: '22', url: 'https://nodejs.org', check: 'node -v' })
    const q = { name: 'Strumento interno', version: '', url: '', check: '' }
    expect(autofillPrerequisite(q)).toBe(false)
  })

  it('deduce i prerequisiti da linguaggi, framework e repository, senza duplicati', () => {
    const s = suggestPrerequisites({ languages: ['TypeScript', 'Rust'], frameworks: ['Tauri'], repoUrl: 'https://github.com/acme/app', prerequisites: [{ id: 'p', name: 'node', version: '', url: '', check: '' }] })
    expect(s.map((p) => p.name)).toEqual(['Git', 'Rust', 'Visual Studio Build Tools'])
    expect(suggestPrerequisites({ languages: ['C#'], frameworks: ['WPF'], repoUrl: '', prerequisites: [] }).map((p) => p.name)).toEqual(['.NET SDK', 'Visual Studio'])
  })
})

describe('importazione di un documento .md nello Stack', () => {
  it('reimporta senza perdite il README generato da «Crea cartella del progetto»', () => {
    const original = stack({
      platforms: ['web'],
      languages: ['TypeScript', 'SQL'],
      frameworks: ['Vue 3', 'Vite', 'Node.js'],
      repoUrl: 'https://github.com/example/app-demo',
      notes: 'Frontend Vue con API Node.js.',
      prerequisites: [{ id: 'p1', name: 'Node.js', version: '20+', url: 'https://nodejs.org', check: 'node -v' }],
      steps: [
        { id: 's1', title: 'Installa le dipendenze', kind: 'command', command: 'npm install', cwd: '', url: '', notes: 'Serve la rete aziendale.' },
        { id: 's2', title: 'Avvia il server', kind: 'command', command: 'npm run dev', cwd: 'server', url: '', notes: '' },
        { id: 's3', title: 'Apri la documentazione', kind: 'link', command: '', cwd: '', url: 'https://example.com/docs', notes: '' },
      ],
      envVars: [{ key: 'API_URL', example: 'http://localhost:3000', notes: 'API locale' }],
    })
    const readme = scaffoldFiles('App Demo', 'Descrizione del progetto.', original).find((f) => f.path === 'README.md')!.content
    const imp = parseStackMarkdown(readme)
    expect(imp.title).toBe('App Demo')
    expect(imp.platforms).toEqual(['web'])
    expect(imp.languages).toEqual(['TypeScript', 'SQL'])
    expect(imp.frameworks).toEqual(['Vue 3', 'Vite', 'Node.js'])
    expect(imp.repoUrl).toBe('https://github.com/example/app-demo')
    expect(imp.notes).toBe('Frontend Vue con API Node.js.')
    expect(imp.prerequisites).toEqual([{ name: 'Node.js', version: '20+', url: 'https://nodejs.org', check: 'node -v' }])
    // Solo la preparazione del PC: l'avvio del server non c'è, e si finisce aprendo l'editor
    expect(imp.steps).toEqual([
      { title: 'Installa le dipendenze', kind: 'command', command: 'npm install', cwd: '', url: '', notes: 'Serve la rete aziendale.' },
      { title: 'Apri la documentazione', kind: 'link', command: '', cwd: '', url: 'https://example.com/docs', notes: '' },
      { title: 'Apri il progetto nell’editor', kind: 'manual', command: '', cwd: '', url: '', notes: 'Fine della configurazione: apri la cartella del progetto nel tuo editor (es. Visual Studio Code con «code .»).' },
    ])
    expect(imp.envVars).toEqual([{ key: 'API_URL', example: 'http://localhost:3000', notes: 'API locale' }])
  })

  it('ricava lo stack da un documento di architettura scritto a mano (in inglese)', () => {
    const md = [
      '# Customer portal',
      '',
      'Internal portal for customers.',
      '',
      '## Architecture',
      '',
      'A React single page app talks to an ASP.NET Core API backed by PostgreSQL. Source: https://github.com/acme/portal.git',
      '',
      '## Requirements',
      '',
      '| Tool | Version |',
      '|---|---|',
      '| .NET SDK | 8 |',
      '| node | 20 |',
      '',
      '## Getting started',
      '',
      '1. Install the packages',
      '   ```bash',
      '   $ cd web',
      '   $ npm ci',
      '   ```',
      '2. Run `dotnet run --project Api`',
      '3. Ask the team lead for the VPN access',
      '',
      '```env',
      '# Connection string',
      'DB_URL=postgres://localhost/portal',
      '```',
    ].join('\n')
    const imp = parseStackMarkdown(md)
    expect(imp.languages).toEqual([]) // nessun linguaggio citato esplicitamente
    expect(imp.frameworks).toEqual(expect.arrayContaining(['React', 'ASP.NET Core', 'PostgreSQL']))
    expect(imp.platforms).toEqual(['web', 'backend'])
    expect(imp.repoUrl).toBe('https://github.com/acme/portal')
    expect(imp.notes).toContain('React single page app')
    expect(imp.prerequisites.map((p) => [p.name, p.version, p.check])).toEqual([
      ['.NET SDK', '8', 'dotnet --version'],
      ['Node.js', '20', 'node -v'],
    ])
    expect(imp.steps.map((s) => s.title)).toEqual(['Install the packages', 'Ask the team lead for the VPN access', 'Apri il progetto nell’editor'])
    expect(imp.steps[0]).toEqual({ title: 'Install the packages', kind: 'command', command: 'npm ci', cwd: 'web', url: '', notes: '' })
    expect(imp.envVars).toEqual([{ key: 'DB_URL', example: 'postgres://localhost/portal', notes: 'Connection string' }])
  })

  it('unisce senza cancellare: aggiunge solo ciò che manca e memorizza il documento', () => {
    const current = stack({
      languages: ['typescript'],
      notes: 'Note già scritte',
      prerequisites: [{ id: 'p1', name: 'Node.js', version: '22', url: '', check: '' }],
      steps: [{ id: 's1', title: 'Installa le dipendenze', kind: 'command', command: 'npm i', cwd: '', url: '', notes: '' }],
    })
    const imp = parseStackMarkdown('# X\n\n**Linguaggi:** TypeScript, Rust\n\n## Prerequisiti\n\n- Node.js 20+\n- Rust\n\n## Setup\n\n1. Installa le dipendenze\n   ```\n   npm install\n   ```\n2. Compila\n   ```\n   cargo build\n   ```\n')
    const { stack: merged, added } = mergeImportedStack(current, imp, doc('# X'))
    expect(merged.languages).toEqual(['typescript', 'Rust'])
    expect(merged.notes).toBe('Note già scritte')
    expect(merged.prerequisites.map((p) => p.name)).toEqual(['Node.js', 'Rust'])
    expect(merged.prerequisites[0]!.version).toBe('22') // il valore esistente resta
    expect(merged.steps.map((s) => s.title)).toEqual(['Installa le dipendenze', 'Apri il progetto nell’editor']) // "Compila" non è preparazione
    expect(merged.doc?.fileName).toBe('ARCHITETTURA.md')
    expect(added).toMatchObject({ languages: 1, prerequisites: 1, steps: 1, notes: false })
  })

  it('il documento importato finisce nella cartella del progetto', () => {
    const files = scaffoldFiles('Demo', '', stack({ doc: doc('# Architettura') }))
    expect(files.find((f) => f.path === 'ARCHITETTURA.md')?.content).toBe('# Architettura')
  })
})

describe('configurazione sul PC: solo preparazione, fino all’editor', () => {
  it('toglie avvio, build, test e deploy e si ferma al passo che apre l’editor', () => {
    const md = [
      '# App',
      '## Setup',
      '1. Clona il repository',
      '   ```',
      '   git clone https://github.com/acme/app.git',
      '   ```',
      '2. Installa le dipendenze',
      '   ```',
      '   npm install',
      '   ```',
      '3. Apri la cartella in VS Code con `code .`',
      '4. Avvia in sviluppo',
      '   ```',
      '   npm run dev',
      '   ```',
      '5. Esegui i test con `npm test`',
    ].join('\n')
    const steps = parseStackMarkdown(md).steps
    expect(steps.map((s) => s.title)).toEqual(['Clona il repository', 'Installa le dipendenze', 'Apri la cartella in VS Code con code .'])
  })
})
