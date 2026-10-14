import { describe, expect, it } from 'vitest'
import { EMPTY_STACK, type Stack } from '@/types'
import { applyTokens, copyStack, hasStack, resolveStack, safeRelPath, scaffoldFiles, slugify, varsFor, writeProjectFolder } from './scaffold'
import { getFs } from './fs'

const stack = (over: Partial<Stack> = {}): Stack => ({ ...EMPTY_STACK, ...over })

describe('scaffold: nomi e segnaposto', () => {
  it('slugify toglie accenti e simboli', () => {
    expect(slugify('Città Più Bella!')).toBe('citta-piu-bella')
    expect(slugify('  Progetto di test  ')).toBe('progetto-di-test')
    expect(slugify('***')).toBe('project')
  })

  it('applyTokens sostituisce {{name}} e {{slug}}', () => {
    const v = varsFor('Nuovo Portale')
    expect(applyTokens('cd {{ slug }} && echo "{{name}}"', v)).toBe('cd nuovo-portale && echo "Nuovo Portale"')
    expect(applyTokens('{{altro}}', v)).toBe('{{altro}}')
  })

  it('safeRelPath accetta solo percorsi relativi dentro la cartella', () => {
    expect(safeRelPath('src\\main.ts')).toBe('src/main.ts')
    expect(safeRelPath('./package.json')).toBe('package.json')
    expect(safeRelPath('../fuori.txt')).toBeNull()
    expect(safeRelPath('/etc/passwd')).toBeNull()
    expect(safeRelPath('C:\\Windows\\x.txt')).toBeNull()
    expect(safeRelPath('  ')).toBeNull()
  })
})

describe('scaffold: copia dello stack', () => {
  const source = stack({
    languages: ['TypeScript'],
    repoUrl: 'https://github.com/acme/progetto-di-test',
    sourcePath: 'Z:\\Progetti\\progetto-di-test',
    notes: 'Progetto di test: frontend Vue',
    prerequisites: [{ id: 'pre_1', name: 'Node.js', version: '20+', url: '', check: 'node -v' }],
    steps: [{ id: 'stp_1', title: 'Clona', kind: 'command', command: 'git clone https://github.com/acme/progetto-di-test.git', cwd: '', url: '', notes: '' }],
    files: [{ id: 'tpl_1', path: 'package.json', content: '{ "name": "{{slug}}" }' }],
  })

  it('rinomina il progetto di origine, rigenera gli id e non copia la cartella locale', () => {
    const c = copyStack(source, 'Progetto di test', 'Portale clienti')
    expect(c.repoUrl).toBe('https://github.com/acme/portale-clienti')
    expect(c.notes).toBe('Portale clienti: frontend Vue')
    expect(c.steps[0]!.command).toContain('portale-clienti.git')
    expect(c.sourcePath).toBe('')
    expect(c.steps[0]!.id).not.toBe('stp_1')
    expect(c.prerequisites[0]!.id).not.toBe('pre_1')
    expect(c.files[0]!.id).not.toBe('tpl_1')
    expect(c.files[0]!.content).toBe('{ "name": "{{slug}}" }') // i segnaposto restano
    expect(source.steps[0]!.command).toContain('progetto-di-test') // l'originale non cambia
  })

  it('hasStack riconosce uno stack vuoto', () => {
    expect(hasStack(EMPTY_STACK)).toBe(false)
    expect(hasStack(source)).toBe(true)
  })

  it('resolveStack risolve i segnaposto per il progetto', () => {
    const r = resolveStack(stack({ steps: [{ id: 's', title: 'Avvia {{name}}', kind: 'command', command: 'cd {{slug}}', cwd: '', url: '', notes: '' }] }), varsFor('App Demo'))
    expect(r.steps[0]!.title).toBe('Avvia App Demo')
    expect(r.steps[0]!.command).toBe('cd app-demo')
  })
})

describe('scaffold: file della cartella del progetto', () => {
  const s = stack({
    languages: ['TypeScript'],
    prerequisites: [{ id: 'p', name: 'Node.js', version: '20+', url: 'https://nodejs.org', check: 'node -v' }],
    steps: [{ id: 's', title: 'Installa', kind: 'command', command: 'npm install', cwd: '', url: '', notes: '' }],
    envVars: [{ key: 'API_URL', example: 'http://localhost:3000', notes: 'API locale' }],
    files: [
      { id: 'a', path: 'package.json', content: '{ "name": "{{slug}}" }' },
      { id: 'b', path: '../fuori.txt', content: 'no' },
      { id: 'c', path: 'README.md', content: '# Personalizzato' },
    ],
  })

  it('genera README, .env.example, script e file iniziali (sicuri, con segnaposto risolti)', () => {
    const files = scaffoldFiles('App Demo', 'Descrizione', s)
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]))
    expect(Object.keys(byPath).sort()).toEqual(['.env.example', 'README.md', 'package.json', 'setup-app-demo.cmd'])
    expect(byPath['package.json']).toBe('{ "name": "app-demo" }')
    expect(byPath['README.md']).toBe('# Personalizzato') // il file dell'admin ha la precedenza
    expect(byPath['.env.example']).toBe('# API locale\nAPI_URL=http://localhost:3000\n')
    expect(byPath['setup-app-demo.cmd']).toContain('npm install')
  })

  it('il README generato descrive stack, prerequisiti e passi', () => {
    const readme = scaffoldFiles('App Demo', 'Descrizione', { ...s, files: [] }).find((f) => f.path === 'README.md')!.content
    expect(readme).toMatch(/^# App Demo\n\nDescrizione/)
    expect(readme).toContain('TypeScript')
    expect(readme).toContain('Node.js 20+')
    expect(readme).toContain('npm install')
    expect(readme).toContain('API_URL')
  })

  it('writeProjectFolder scrive i file in <destinazione>/<slug>, anche in sottocartelle', async () => {
    const root = await writeProjectFolder('/dest', 'App Demo', [
      { path: 'README.md', content: '# App' },
      { path: 'src/main.ts', content: 'console.log(1)' },
    ])
    const fs = await getFs()
    expect(root).toBe('/dest/app-demo')
    expect(await fs.readText('/dest/app-demo/src/main.ts')).toBe('console.log(1)')
    expect(await fs.readText('/dest/app-demo/README.md')).toBe('# App')
  })
})
