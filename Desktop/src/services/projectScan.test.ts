import { describe, expect, it } from 'vitest'
import { getFs } from './fs'
import { detectStack, isInside, repoFromGitConfig, samePath, scanProjects } from './projectScan'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSessionStore } from '@/stores/session'

/** Cartella di progetti di esempio nel filesystem in memoria. */
async function seed() {
  const fs = await getFs()
  const w = (p: string, t: string) => fs.writeTextAtomic(p, t)
  // Portale: Vue 3 + TypeScript, repository git (SSH), README con descrizione e variabili
  await w('/progetti/portale/package.json', JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vue: '^3.5.0', pinia: '^3' }, devDependencies: { typescript: '~5.9', vite: '^6', tailwindcss: '^4' } }))
  await w('/progetti/portale/.git/config', '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:acme/portale.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n')
  await w('/progetti/portale/README.md', '# Portale\n\nPortale clienti con area documenti.\n\n## Variabili d’ambiente\n\n| Variabile | Esempio |\n|---|---|\n| `API_URL` | `http://localhost:3000` |\n')
  // Desktop: Tauri (src-tauri) con pnpm
  await w('/progetti/app-desktop/package.json', JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { '@tauri-apps/api': '^2', react: '^19' } }))
  await w('/progetti/app-desktop/pnpm-lock.yaml', '')
  await w('/progetti/app-desktop/src-tauri/Cargo.toml', '[package]\nname = "app"')
  // Gestionale .NET WPF con documento di architettura
  await w('/progetti/Gestionale/Gestionale.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>')
  await w('/progetti/Gestionale/ARCHITETTURA.md', '# Gestionale\n\n## Prerequisiti\n\n- SQL Server\n')
  // Non progetti: cartella vuota, node_modules, cartella nascosta, un workspace di Todo Doto
  await w('/progetti/vuota/note.txt', 'appunti')
  await w('/progetti/node_modules/x/package.json', '{}')
  await w('/progetti/.cache/package.json', '{}')
  await w('/progetti/roadmap/workspace.json', '{}')
  await w('/progetti/roadmap/README.md', '# Roadmap')
}

describe('progetti esistenti in una cartella', () => {
  it('riconosce le sottocartelle di progetto e ignora le altre', async () => {
    await seed()
    const found = await scanProjects('/progetti')
    expect(found.map((p) => p.name)).toEqual(['app-desktop', 'Gestionale', 'portale'])
    expect(found.find((p) => p.name === 'portale')!.markers).toEqual(expect.arrayContaining(['.git', 'package.json', 'README.md']))
    expect(found[0]!.path).toBe('/progetti/app-desktop')
  })

  it('una cartella che è essa stessa un progetto, senza sottoprogetti, vale come progetto unico', async () => {
    await seed()
    expect((await scanProjects('/progetti/portale')).map((p) => p.name)).toEqual(['portale'])
    expect(await scanProjects('/progetti/vuota')).toEqual([])
  })

  it('ricava lo stack dai file del progetto', async () => {
    await seed()
    const { description, stack } = await detectStack('/progetti/portale')
    expect(description).toBe('Portale clienti con area documenti.')
    expect(stack.sourcePath).toBe('/progetti/portale')
    expect(stack.repoUrl).toBe('https://github.com/acme/portale')
    expect(stack.languages).toEqual(['TypeScript'])
    expect(stack.frameworks).toEqual(['Vue 3', 'Pinia', 'Vite', 'Tailwind CSS'])
    expect(stack.platforms).toEqual(['web'])
    // Solo preparazione: installazione e poi l'editor, niente avvio
    expect(stack.steps.map((s) => s.command)).toEqual(['npm install', ''])
    expect(stack.steps.at(-1)!.title).toBe('Apri il progetto nell’editor')
    expect(stack.prerequisites.map((p) => p.name)).toEqual(['Node.js', 'Git'])
    expect(stack.envVars).toEqual([{ key: 'API_URL', example: 'http://localhost:3000', notes: '' }])
    expect(stack.doc).toBeNull() // il README non è un documento di architettura

    const tauri = (await detectStack('/progetti/app-desktop')).stack
    expect(tauri.languages).toEqual(['JavaScript', 'Rust'])
    expect(tauri.frameworks).toEqual(['Tauri', 'React']) // nell'ordine delle dipendenze
    expect(tauri.platforms).toEqual(['desktop'])
    expect(tauri.steps.map((s) => s.command)).toEqual(['pnpm install', ''])
    expect(tauri.prerequisites.map((p) => p.name)).toEqual(['Node.js', 'Rust', 'Visual Studio Build Tools', 'WebView2 Runtime'])

    const net = (await detectStack('/progetti/Gestionale')).stack
    expect(net.languages).toEqual(['C#', 'SQL']) // SQL citato nel documento di architettura (SQL Server)
    expect(net.frameworks).toEqual(expect.arrayContaining(['WPF', '.NET']))
    expect(net.steps.map((s) => s.title)).toEqual(['Ripristina i pacchetti NuGet', 'Apri Gestionale.csproj in Visual Studio'])
    expect(net.prerequisites.map((p) => p.name)).toEqual(['SQL Server', '.NET SDK', 'Visual Studio'])
    expect(net.doc?.fileName).toBe('ARCHITETTURA.md')
  })

  it('repository da .git/config, anche SSH e con credenziali', () => {
    expect(repoFromGitConfig('[remote "origin"]\n\turl = git@gitlab.com:team/app.git')).toBe('https://gitlab.com/team/app')
    expect(repoFromGitConfig('[remote "origin"]\n\turl = https://user:token@github.com/a/b.git')).toBe('https://github.com/a/b')
    expect(repoFromGitConfig('[core]')).toBe('')
  })

  it('confronto fra percorsi: stessa cartella e cartelle interne', () => {
    expect(samePath('Z:\\Progetti\\', 'z:/progetti')).toBe(true)
    expect(isInside('Z:\\Progetti\\portale\\pgm', 'Z:\\Progetti\\portale')).toBe(true)
    expect(isInside('Z:\\Progetti\\portale-roadmap', 'Z:\\Progetti\\portale')).toBe(false)
  })

  it('il workspace creato in un’altra cartella importa i progetti con il loro stack', async () => {
    await seed()
    await useSessionStore().init()
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/dati/roadmap', projectsPath: '/progetti', name: 'Roadmap', mode: 'local' })).ok).toBe(true)
    // I recenti ricordano la cartella dei progetti (mostrata) e quella dei dati (da cui si apre)
    expect(ws.meta?.projectsPath).toBe('/progetti')
    expect(useSessionStore().config.recent[0]).toMatchObject({ path: '/dati/roadmap', projectsPath: '/progetti' })
    const steps: string[] = []
    const n = await ws.importProjects(await scanProjects('/progetti'), (d, t) => steps.push(`${d}/${t}`))
    expect(n).toBe(3)
    expect(steps).toEqual(['1/3', '2/3', '3/3'])
    expect(ws.visibleProjects.map((p) => p.name)).toEqual(['app-desktop', 'Gestionale', 'portale'])
    const portale = ws.visibleProjects.find((p) => p.name === 'portale')!
    expect(portale.description).toBe('Portale clienti con area documenti.')
    expect(portale.stack.sourcePath).toBe('/progetti/portale')
    expect(portale.stack.frameworks).toContain('Vue 3')
    // I dati del workspace stanno nella sua cartella, non tra i progetti
    const fs = await getFs()
    expect(await fs.exists('/dati/roadmap/workspace.json')).toBe(true)
    expect(await fs.exists('/progetti/workspace.json')).toBe(false)
  })
})

describe('inferProjectsPath', () => {
  it('ricava la cartella madre più frequente delle cartelle dei progetti', async () => {
    const { inferProjectsPath } = await import('./projectScan')
    expect(inferProjectsPath(['/progetti/alfa', '/progetti/beta/', '/altro/gamma'])).toBe('/progetti')
    expect(inferProjectsPath(['Z:\\Progetti\\Alfa', 'z:/progetti/Beta'])).toBe('Z:\\Progetti')
    expect(inferProjectsPath(['/solo/uno'])).toBe('/solo')
  })
  it('nessuna cartella credibile: stringa vuota', async () => {
    const { inferProjectsPath } = await import('./projectScan')
    expect(inferProjectsPath([])).toBe('')
    expect(inferProjectsPath(['C:\\Progetto'])).toBe('')
    expect(inferProjectsPath(['progetto'])).toBe('')
  })
})

describe('inspectFolder (cartella di un singolo progetto)', () => {
  it('riconosce progetti di qualunque tipo o linguaggio', async () => {
    const { inspectFolder } = await import('./projectScan')
    const fs = await getFs()
    await fs.writeTextAtomic('/singolo/node/package.json', '{}')
    await fs.writeTextAtomic('/singolo/cmake/CMakeLists.txt', 'project(x)')
    await fs.writeTextAtomic('/singolo/script/analisi.py', 'print(1)')
    await fs.writeTextAtomic('/singolo/sorgenti/src/main.go', 'package main')
    await fs.writeTextAtomic('/singolo/sito/index.html', '<html>')
    for (const d of ['node', 'cmake', 'script', 'sorgenti', 'sito']) expect((await inspectFolder(`/singolo/${d}`)).kind).toBe('project')
    expect((await inspectFolder('/singolo/sorgenti')).markers).toEqual(['src/main.go'])
  })
  it('cartella nuova, vuota, con altri file, di progetti o Dati del workspace', async () => {
    const { inspectFolder } = await import('./projectScan')
    const fs = await getFs()
    expect((await inspectFolder('/singolo/nuova')).kind).toBe('missing')
    await fs.writeTextAtomic('/singolo/vuota/desktop.ini', '')
    expect((await inspectFolder('/singolo/vuota')).kind).toBe('empty')
    await fs.writeTextAtomic('/singolo/documenti/lettera.docx', 'x')
    await fs.writeTextAtomic('/singolo/documenti/README.md', '# solo readme')
    expect((await inspectFolder('/singolo/documenti')).kind).toBe('other')
    await fs.writeTextAtomic('/singolo/dati/workspace.json', '{}')
    expect((await inspectFolder('/singolo/dati')).kind).toBe('workspace')
    await fs.writeTextAtomic('/molti/alfa/package.json', '{}')
    await fs.writeTextAtomic('/molti/beta/Cargo.toml', '')
    const many = await inspectFolder('/molti')
    expect(many.kind).toBe('projects')
    expect(many.markers).toEqual(['alfa', 'beta'])
  })
  it('la cartella dei progetti continua a usare il suo riconoscimento (sottocartelle)', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/cartella-progetti/solo-sorgenti/main.py', 'x')
    await fs.writeTextAtomic('/cartella-progetti/node/package.json', '{}')
    // Un singolo .py non basta per la scansione della cartella dei progetti (logica distinta)
    expect((await scanProjects('/cartella-progetti')).map((p) => p.name)).toEqual(['node'])
  })
})

describe('detectStack: progetti con i file di progetto nelle sottocartelle (anche di rete)', () => {
  it('soluzione .NET in src\App e frontend separato: linguaggi, framework e prerequisiti', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/rete/gestionale/Gestionale.sln', '')
    await fs.writeTextAtomic('/rete/aziendale/src/Api/Api.csproj', '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>')
    await fs.writeTextAtomic('/rete/aziendale/frontend/package.json', JSON.stringify({ dependencies: { vue: '^3.4.0' }, devDependencies: { typescript: '^5' } }))
    await fs.writeTextAtomic('/rete/aziendale/node_modules/x/package.json', JSON.stringify({ dependencies: { react: '18' } }))
    await fs.writeTextAtomic('/rete/aziendale/README.md', '# Aziendale')
    const { stack } = await detectStack('/rete/aziendale')
    expect(stack.languages).toEqual(expect.arrayContaining(['C#', 'TypeScript']))
    expect(stack.frameworks).toEqual(expect.arrayContaining(['ASP.NET Core', 'Vue 3']))
    expect(stack.frameworks).not.toContain('React') // node_modules non si esplora
    expect(stack.prerequisites.map((p) => p.name)).toEqual(expect.arrayContaining(['Node.js', '.NET SDK']))
    // I passi delle sottocartelle si eseguono lì
    const install = stack.steps.find((x) => x.command === 'npm install')!
    expect(install.cwd).toBe('frontend')
    expect(stack.steps.find((x) => x.command === 'dotnet restore')!.cwd).toBe('src\\Api')
  })
  it('la cartella del progetto che non si legge non diventa uno stack vuoto: l’errore arriva a chi chiama', async () => {
    const { stackFromSource } = await import('./projectScan')
    const failing = {
      list: async () => {
        throw new Error('Access is denied. (os error 5)')
      },
      read: async () => null,
    }
    await expect(stackFromSource(failing)).rejects.toThrow('os error 5')
  })
})
