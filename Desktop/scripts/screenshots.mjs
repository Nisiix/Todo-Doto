// Genera le schermate della landing page (Web/assets/screens/<lingua>/) con dati
// di esempio generici, inseriti dall'interfaccia come farebbe un utente.
//
// Uso:   node scripts/screenshots.mjs            (italiano e inglese)
//        node scripts/screenshots.mjs en         (una sola lingua)
// Salva anche i fotogrammi dei video tutorial (../Video/frames/<lingua>/, con le
// zone da inquadrare in boxes.json), usati da ../Video/build.mjs.
// Browser: Microsoft Edge installato (channel msedge); per un altro Chromium
// impostare PW_CHROMIUM_PATH=/percorso/chrome.
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '..', 'Web', 'assets', 'screens')
const FRAMES = join(ROOT, '..', 'Video', 'frames')
const VIEWPORT = { width: 1600, height: 1000 }

const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

// File iniziali dello stack di esempio (uguali nelle due lingue).
const TEMPLATE_FILES = [
  ['package.json', ['{', '  "name": "{{slug}}",', '  "private": true', '}', ''].join('\n')],
  ['.gitignore', ['node_modules', 'dist', '.env', ''].join('\n')],
]

// Testi dell'interfaccia usati per trovare i controlli, e dati di esempio.
const LANGS = {
  it: {
    tag: 'it-IT',
    ui: {
      createWs: 'Crea workspace', browse: 'Sfoglia', pickProjects: 'Scegli la cartella dei progetti', pickData: 'Scegli la cartella Dati Todo Doto', folderActions: 'Azioni cartella', newProjectHere: 'Nuovo progetto qui', settings: 'Impostazioni', save: 'Salva', create: 'Crea', close: 'Chiudi',
      labels: 'Etichette', newLabelPh: 'Nuova etichetta', labelName: 'Nome etichetta', add: 'Aggiungi', color: 'Colore', closeEsc: 'Chiudi (Esc)',
      newFolder: 'Nuova cartella', folderName: 'Nome cartella', createFolder: 'Crea cartella',
      project: 'Progetto', createProject: 'Crea progetto', newItem: 'Nuovo task', markDone: 'Segna come completato (C)',
      ask: 'Fai una domanda', favorite: 'Aggiungi ai preferiti', answer: 'Rispondi', yourAnswer: 'La tua risposta', comment: 'Scrivi un commento',
      attachmentsTab: 'Allegati', folderBtn: 'Cartella', folderPh: 'Es. Specifiche, Mockup, Contratti', attachmentBtn: 'Allegato',
      fillStack: 'Aggiungi stack tecnologico', languagesPh: 'Es. TypeScript, C#, Rust', frameworksPh: 'Es. Vue 3, Tauri, .NET 4.0',
      prereq: 'Prerequisito', prereqName: 'Nome, es. Node.js', version: 'Versione', downloadUrl: 'Dove scaricarlo (URL)', checkCmd: 'Comando di verifica, es. node -v',
      step: 'Passo', stepTitle: 'Titolo del passo, es. Installa le dipendenze', commands: 'Uno o più comandi, uno per riga (es. npm install)',
      envVar: 'Variabile', varName: 'NOME_VARIABILE', varExample: 'valore di esempio', varNotes: 'A cosa serve / dove si prende', markStepDone: 'Segna come fatto', file: 'File', filePath: 'Percorso, es. package.json o src/main.ts', fileContent: 'Contenuto del file', copyFrom: (n) => `Copia da «${n}»`,
      aiSection: 'Strumenti AI', newTool: 'Nuovo strumento', connector: 'Connettore', skill: 'Skill', pastePh: '…oppure incolla',
      audit: 'Cronologia operazioni', analytics: 'Analisi', setupTitle: 'Configura sul tuo PC',
    },
    data: {
      ws: 'Roadmap di test',
      projectsPath: 'D:/Progetti',
      dataPath: 'D:/Todo Doto',
      user: 'Mario Rossi',
      labels: [['Bug', '#D64545'], ['Cliente', '#9B7BD6'], ['Interno', '#6B7280']],
      folder: 'Clienti',
      main: { name: 'Progetto di test', desc: 'Progetto dimostrativo: un’applicazione web con area riservata, esportazioni e notifiche.' },
      items: [
        { title: 'Pagina di accesso con verifica email', priority: 'immediata', status: 'confermato', due: 2, label: 'Bug', assign: true },
        { title: 'Esportazione dei dati in CSV', notes: 'Colonne e separatore da concordare con il cliente.', priority: 'alta', status: 'confermato', due: 12, label: 'Cliente', assign: true },
        { title: 'Ottimizzare i tempi di caricamento', priority: 'alta', status: 'da_valutare', due: 5, assign: true },
        { title: 'Notifiche email per le scadenze', priority: 'media', status: 'da_definire', label: 'Interno', assign: true },
        { title: 'Tema scuro per la dashboard', priority: 'bassa', status: 'da_valutare' },
        { title: 'Configurare l’ambiente di test', priority: 'media', status: 'confermato', complete: true, assign: true },
      ],
      detailItem: 'Esportazione dei dati in CSV',
      question: 'Usiamo il punto e virgola o la virgola come separatore?',
      answerText: 'Punto e virgola: così il file si apre bene anche in Excel.',
      commentText: 'File di esempio condiviso: https://example.com/esportazione-di-esempio.csv',
      others: [
        { name: 'Portale clienti demo', folder: true, items: [{ title: 'Area documenti per i clienti', priority: 'alta', status: 'da_definire', due: 9, assign: true }, { title: 'Modulo di contatto', priority: 'media', status: 'confermato', assign: true }] },
        { name: 'App mobile di prova', items: [{ title: 'Notifiche push', priority: 'immediata', status: 'confermato', due: -1, assign: true }, { title: 'Schermata di benvenuto', priority: 'media', status: 'da_valutare', assign: true }] },
        { name: 'Sito web di esempio', items: [{ title: 'Pagina dei prezzi', priority: 'media', status: 'da_definire', due: 20, assign: true }, { title: 'Aggiornare i testi della home', priority: 'bassa', status: 'da_valutare' }] },
      ],
      attFolder: 'Specifiche',
      attachments: [
        { name: 'Mockup dell’interfaccia', url: 'https://example.com/mockup', folder: true },
        { name: 'Documento dei requisiti', url: 'https://example.com/requisiti', folder: true },
        { name: 'Repository del progetto', url: 'https://github.com/example/progetto-di-test' },
      ],
      fileName: 'Preventivo di esempio',
      stack: {
        languages: ['TypeScript', 'SQL'],
        frameworks: ['Vue 3', 'Vite', 'Node.js'],
        repo: 'https://github.com/example/progetto-di-test',
        notes: 'Frontend Vue con API Node.js. Per le domande sull’ambiente chiedi a Mario.',
        prereqs: [['Node.js', '20+', 'https://nodejs.org', 'node -v'], ['Git', '', 'https://git-scm.com', 'git --version']],
        steps: [['Clona il repository', 'git clone https://github.com/example/progetto-di-test.git'], ['Installa le dipendenze', 'npm install'], ['Apri il progetto nell’editor', 'code .']],
        env: [['API_URL', 'http://localhost:3000', 'Indirizzo delle API in locale']],
        files: TEMPLATE_FILES,
      },
      tools: [
        { kind: 'connector', name: 'GitHub', url: 'https://github.com', notes: 'Lettura di issue e pull request del repository.' },
        { kind: 'skill', name: 'frontend-design', notes: 'Linee guida per l’interfaccia del progetto.', content: '---\nname: frontend-design\n---\n# Frontend design\nUsa i colori e i componenti del progetto.' },
      ],
      search: 'pagina',
      fromTemplate: 'Nuovo gestionale',
      newItem: { title: 'Ricerca nell’elenco dei clienti', notes: 'Filtro per nome, città e stato del contratto.', priority: 'alta', status: 'da_definire', due: 15, label: 'Cliente', assign: true },
    },
  },
  en: {
    tag: 'en-US',
    ui: {
      createWs: 'Create workspace', browse: 'Browse', pickProjects: 'Choose the projects folder', pickData: 'Choose the Todo Doto data folder', folderActions: 'Folder actions', newProjectHere: 'New project here', settings: 'Settings', save: 'Save', create: 'Create', close: 'Close',
      labels: 'Labels', newLabelPh: 'New label', labelName: 'Label name', add: 'Add', color: 'Color', closeEsc: 'Close (Esc)',
      newFolder: 'New folder', folderName: 'Folder name', createFolder: 'Create folder',
      project: 'Project', createProject: 'Create project', newItem: 'New task', markDone: 'Mark as completed (C)',
      ask: 'Ask a question', favorite: 'Add to favorites', answer: 'Answer', yourAnswer: 'Your answer', comment: 'Write a comment',
      attachmentsTab: 'Attachments', folderBtn: 'Folder', folderPh: 'E.g. Specs, Mockups, Contracts', attachmentBtn: 'Attachment',
      fillStack: 'Add technology stack', languagesPh: 'E.g. TypeScript, C#, Rust', frameworksPh: 'E.g. Vue 3, Tauri, .NET 4.0',
      prereq: 'Prerequisite', prereqName: 'Name, e.g. Node.js', version: 'Version', downloadUrl: 'Where to download it (URL)', checkCmd: 'Check command, e.g. node -v',
      step: 'Step', stepTitle: 'Step title, e.g. Install the dependencies', commands: 'One or more commands, one per line (e.g. npm install)',
      envVar: 'Variable', varName: 'VARIABLE_NAME', varExample: 'example value', varNotes: 'What it is for / where to get it', markStepDone: 'Mark as done', file: 'File', filePath: 'Path, e.g. package.json or src/main.ts', fileContent: 'File content', copyFrom: (n) => `Copy from “${n}”`,
      aiSection: 'AI tools', newTool: 'New tool', connector: 'Connector', skill: 'Skill', pastePh: '…or paste',
      audit: 'Activity log', analytics: 'Analytics', setupTitle: 'Set up on your PC',
    },
    data: {
      ws: 'Test roadmap',
      projectsPath: 'D:/Projects',
      dataPath: 'D:/Todo Doto',
      user: 'John Smith',
      labels: [['Bug', '#D64545'], ['Customer', '#9B7BD6'], ['Internal', '#6B7280']],
      folder: 'Customers',
      main: { name: 'Test project', desc: 'Demo project: a web application with a private area, exports and notifications.' },
      items: [
        { title: 'Sign-in page with email verification', priority: 'immediata', status: 'confermato', due: 2, label: 'Bug', assign: true },
        { title: 'Export data to CSV', notes: 'Columns and separator to be agreed with the customer.', priority: 'alta', status: 'confermato', due: 12, label: 'Customer', assign: true },
        { title: 'Improve loading times', priority: 'alta', status: 'da_valutare', due: 5, assign: true },
        { title: 'Email reminders for due dates', priority: 'media', status: 'da_definire', label: 'Internal', assign: true },
        { title: 'Dark theme for the dashboard', priority: 'bassa', status: 'da_valutare' },
        { title: 'Set up the test environment', priority: 'media', status: 'confermato', complete: true, assign: true },
      ],
      detailItem: 'Export data to CSV',
      question: 'Should we use a semicolon or a comma as separator?',
      answerText: 'Semicolon: that way the file also opens nicely in Excel.',
      commentText: 'Sample file shared: https://example.com/sample-export.csv',
      others: [
        { name: 'Demo customer portal', folder: true, items: [{ title: 'Document area for customers', priority: 'alta', status: 'da_definire', due: 9, assign: true }, { title: 'Contact form', priority: 'media', status: 'confermato', assign: true }] },
        { name: 'Sample mobile app', items: [{ title: 'Push notifications', priority: 'immediata', status: 'confermato', due: -1, assign: true }, { title: 'Welcome screen', priority: 'media', status: 'da_valutare', assign: true }] },
        { name: 'Example website', items: [{ title: 'Pricing page', priority: 'media', status: 'da_definire', due: 20, assign: true }, { title: 'Refresh the home page copy', priority: 'bassa', status: 'da_valutare' }] },
      ],
      attFolder: 'Specs',
      attachments: [
        { name: 'Interface mockup', url: 'https://example.com/mockup', folder: true },
        { name: 'Requirements document', url: 'https://example.com/requirements', folder: true },
        { name: 'Project repository', url: 'https://github.com/example/test-project' },
      ],
      fileName: 'Sample quote',
      stack: {
        languages: ['TypeScript', 'SQL'],
        frameworks: ['Vue 3', 'Vite', 'Node.js'],
        repo: 'https://github.com/example/test-project',
        notes: 'Vue frontend with a Node.js API. For questions about the environment ask John.',
        prereqs: [['Node.js', '20+', 'https://nodejs.org', 'node -v'], ['Git', '', 'https://git-scm.com', 'git --version']],
        steps: [['Clone the repository', 'git clone https://github.com/example/test-project.git'], ['Install the dependencies', 'npm install'], ['Open the project in the editor', 'code .']],
        env: [['API_URL', 'http://localhost:3000', 'Local API address']],
        files: TEMPLATE_FILES,
      },
      tools: [
        { kind: 'connector', name: 'GitHub', url: 'https://github.com', notes: 'Reads the repository issues and pull requests.' },
        { kind: 'skill', name: 'frontend-design', notes: 'Interface guidelines for the project.', content: '---\nname: frontend-design\n---\n# Frontend design\nUse the project colors and components.' },
      ],
      search: 'page',
      fromTemplate: 'New management app',
      newItem: { title: 'Search in the customer list', notes: 'Filter by name, city and contract status.', priority: 'alta', status: 'da_definire', due: 15, label: 'Customer', assign: true },
    },
  },
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

async function startPreview(outDir, port) {
  const proc = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' })
  const url = `http://localhost:${port}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { proc, url }
    } catch {
      /* non ancora pronto */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  proc.kill()
  throw new Error(`vite preview non risponde su ${url}`)
}

async function capture(lang) {
  const { tag, ui: T, data: D } = LANGS[lang]
  const outDir = `dist-screens/${lang}`
  run(`npx vite build --mode ${lang} --outDir ${outDir} --emptyOutDir --logLevel warn`)
  const { proc, url } = await startPreview(outDir, lang === 'it' ? 4181 : 4182)
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: [`--lang=${tag}`] } : { channel: 'msedge', args: [`--lang=${tag}`] })
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, locale: tag, colorScheme: 'light' })
    // "PC" con il banner dell'IA locale già chiuso e un motore simulato (Ollama con i modelli consigliati)
    await context.addInitScript(() => {
      Object.assign(window, {
        __pgmSeedFiles: { '/appdata/config.json': JSON.stringify({ ai: { bannerDismissed: true, autoDetectDone: true } }) },
        __pgmAi: {
          request(req) {
            const path = new URL(req.url).pathname
            if (path === '/api/tags') return { status: 200, body: JSON.stringify({ models: [{ name: 'qwen3:4b' }, { name: 'nomic-embed-text:latest' }] }) }
            if (path === '/api/version') return { status: 200, body: '{"version":"0.12.6"}' }
            return { status: 404, body: '{}' }
          },
        },
      })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const dir = join(OUT, lang)
    mkdirSync(dir, { recursive: true })

    const dialog = () => page.getByRole('dialog')
    const rows = () => page.locator('[data-item-row]')
    const quiet = async () => {
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      await page.locator('[role=status]').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(250)
    }
    const shot = async (name, { top = true } = {}) => {
      await quiet()
      // Il contenuto della pagina parte dall'alto, salvo dove si vuole mostrare una parte più in basso
      if (top) await page.evaluate(() => document.querySelectorAll('main .overflow-y-auto').forEach((e) => (e.scrollTop = 0)))
      await page.screenshot({ path: join(dir, `${name}.png`) })
      console.log(`  ${lang}/${name}.png`)
    }
    // Fotogrammi dei tutorial: schermata + zona da inquadrare (in pixel della schermata)
    const frameDir = join(FRAMES, lang)
    mkdirSync(frameDir, { recursive: true })
    const boxes = {}
    const frame = async (name, focus, { settle = 350 } = {}) => {
      await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2)
      await page.waitForTimeout(settle)
      const box = focus ? await focus.boundingBox().catch(() => null) : null
      boxes[name] = box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null
      await page.screenshot({ path: join(frameDir, `${name}.png`) })
      writeFileSync(join(frameDir, 'boxes.json'), JSON.stringify({ viewport: VIEWPORT, boxes }, null, 2))
      console.log(`  frame ${lang}/${name}.png`)
    }
    const wsMenu = async (item) => {
      await page.getByRole('button', { name: D.ws }).first().click()
      await page.getByRole('menuitem', { name: item }).click()
    }
    const openSection = (name) => page.locator('aside').first().getByRole('link', { name: new RegExp(`^${name}( \\d+)?$`) }).click()
    const openProject = async (name) => {
      await page.locator('aside').first().getByRole('link', { name }).first().click()
      await page.getByRole('heading', { name, level: 1 }).waitFor()
    }

    // --- workspace, nome visibile, etichette, cartella ---------------------------
    await page.goto(url)
    await page.getByRole('button', { name: T.createWs }).first().waitFor()
    await frame('welcome', page.getByRole('button', { name: T.createWs }).first())
    await page.getByRole('button', { name: T.createWs }).first().click()
    await page.fill('#ws-name', D.ws)
    // Cartella dei progetti e cartella Dati Todo Doto: con i pulsanti Sfoglia del dialog
    // (nel browser il filesystem è in memoria: i percorsi digitati non esisterebbero)
    await page.getByRole('button', { name: T.pickProjects }).click()
    await page.getByRole('button', { name: T.pickData }).click()
    await frame('ws-create', dialog())
    await page.getByRole('button', { name: T.createWs }).last().click()
    await page.getByRole('heading', { name: D.ws }).waitFor()

    // Impostazioni dal menu del workspace, scheda "Dati utente"
    await page.locator('[data-workspace-menu]').click()
    await page.getByRole('menuitem', { name: T.settings }).click()
    await page.locator('[data-settings-tab="user"]').click()
    await page.fill('#s-me', D.user)
    await dialog().getByRole('button', { name: T.save, exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })

    await wsMenu(T.labels)
    for (const [name, color] of D.labels) {
      await dialog().getByPlaceholder(T.newLabelPh).fill(name)
      await dialog().getByLabel(`${T.color} ${color}`).click()
      await dialog().getByRole('button', { name: T.add, exact: true }).click()
      await dialog().getByLabel(`${T.labelName} ${name}`).waitFor()
    }
    await dialog().getByRole('button', { name: T.close, exact: true }).last().click()

    await page.getByTitle(T.newFolder).click()
    await page.fill(`input[placeholder="${T.folderName}"]`, D.folder)
    await page.getByRole('button', { name: T.createFolder }).click()

    // --- progetti ed elementi -----------------------------------------------------
    // Il dialog attuale chiede solo il nome (la cartella del progetto si propone da sola);
    // la descrizione arriva da import/GitHub e la cartella della barra laterale dal menu della cartella.
    const createProject = async (name, _desc, inFolder) => {
      if (inFolder) {
        await page.locator('aside').first().getByText(D.folder, { exact: true }).hover()
        await page.locator('aside').first().getByLabel(T.folderActions).click()
        await page.getByText(T.newProjectHere).click()
      } else await page.getByRole('button', { name: T.project, exact: true }).click()
      await page.fill('#p-name', name)
      if (name === D.main.name) await frame('project-create', dialog())
      await page.getByRole('button', { name: T.createProject }).click()
      await page.getByRole('heading', { name, level: 1 }).waitFor()
    }
    const fillItem = async (it) => {
      await page.fill('#i-title', it.title)
      if (it.notes) await page.fill('#i-notes', it.notes)
      // Campi per id (prefisso "i-" nel dialog del nuovo task): priorità, stato, scadenza, assegnatario, etichetta
      await dialog().locator('#i-priority').selectOption(it.priority)
      await dialog().locator('#i-status').selectOption(it.status)
      // La scadenza si indica solo con stato Confermato (il campo è disattivato altrimenti)
      if (it.due !== undefined && it.status === 'confermato') await dialog().locator('#i-due').fill(day(it.due))
      if (it.label) await dialog().locator('#i-label').selectOption({ label: it.label })
      if (it.assign) await dialog().locator('#i-assignee').selectOption({ index: 1 })
    }
    const addItem = async (it) => {
      await page.getByRole('button', { name: T.newItem }).click()
      await fillItem(it)
      if (it === D.items[1]) await frame('item-create', dialog())
      await dialog().getByRole('button', { name: T.create, exact: true }).click()
      await dialog().waitFor({ state: 'hidden' })
      if (it.complete) await rows().filter({ hasText: it.title }).getByTitle(T.markDone).click()
    }

    for (const p of D.others) {
      await createProject(p.name, '', p.folder)
      for (const it of p.items) await addItem(it)
    }
    await createProject(D.main.name, D.main.desc, true)
    await page.getByTitle(T.favorite).click()
    for (const it of D.items) await addItem(it)

    // Domanda con risposta e commento sull'elemento di dettaglio
    await rows().filter({ hasText: D.detailItem }).getByText(D.detailItem).click()
    await page.getByPlaceholder(T.ask, { exact: true }).fill(D.question)
    await page.getByPlaceholder(T.ask, { exact: true }).press('Enter')
    await page.getByRole('button', { name: T.answer }).first().click()
    await page.getByPlaceholder(T.yourAnswer).fill(D.answerText)
    await page.getByPlaceholder(T.yourAnswer).press('Enter')
    await page.getByPlaceholder(T.comment, { exact: true }).fill(D.commentText)
    await page.getByPlaceholder(T.comment, { exact: true }).press('Enter')
    await page.getByText(D.answerText).waitFor()
    await page.getByTitle(T.closeEsc).click()

    // 1) Lista del progetto (hero)
    await shot('project-list')
    await frame('project-list', rows().first().locator('xpath=..'))
    await page.getByRole('button', { name: /^(Filtri|Filters)/ }).click()
    await frame('filters', page.locator('main header'))
    await page.getByRole('button', { name: /^(Filtri|Filters)/ }).click()

    // 2) Dettaglio con domanda e commento
    await rows().filter({ hasText: D.detailItem }).getByText(D.detailItem).click()
    await page.getByText(D.answerText).waitFor()
    await shot('project-detail')
    await frame('item-detail', page.getByText(D.answerText).locator('xpath=ancestor::section[1]'))
    await page.getByTitle(T.closeEsc).click()

    // Gantt dei task confermati con scadenza
    await openSection('Gantt')
    await page.waitForTimeout(400)
    await frame('gantt', page.locator('main .overflow-y-auto').first())

    // 3) Allegati (sezione del progetto nel sottomenu della barra laterale)
    await openSection(T.attachmentsTab)
    await page.getByRole('button', { name: T.folderBtn, exact: true }).click()
    await page.fill(`input[placeholder="${T.folderPh}"]`, D.attFolder)
    await page.getByRole('button', { name: T.create, exact: true }).click()
    for (const a of D.attachments) {
      await page.getByRole('button', { name: T.attachmentBtn, exact: true }).click()
      await page.fill('#a-target', a.url)
      await page.fill('#a-name', a.name)
      if (a.folder) await page.selectOption('#a-folder', { label: D.attFolder })
      await dialog().getByRole('button', { name: T.create, exact: true }).click()
      await dialog().waitFor({ state: 'hidden' })
    }
    await page.getByRole('button', { name: T.attachmentBtn, exact: true }).click()
    await page.getByRole('radio', { name: 'File' }).click()
    await dialog().getByRole('button', { name: T.browse }).click()
    await page.fill('#a-name', D.fileName)
    await page.selectOption('#a-folder', { label: D.attFolder })
    await dialog().getByRole('button', { name: T.create, exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
    await shot('attachments')

    // 4) Stack
    const S = D.stack
    await openSection('Stack')
    await page.getByRole('button', { name: T.fillStack }).click()
    await page.getByRole('button', { name: 'Web', exact: true }).click()
    // Campi a chip: il segnaposto sparisce dopo il primo valore, quindi si va per posizione
    const chips = page.locator('form input.min-w-24')
    for (const [i, values] of [S.languages, S.frameworks].entries()) {
      for (const v of values) {
        await chips.nth(i).fill(v)
        await chips.nth(i).press('Enter')
      }
    }
    await page.fill('#st-repo', S.repo)
    await page.fill('#st-notes', S.notes)
    // I prerequisiti (Node.js da TypeScript/Vue, Git dal repository) si aggiungono da soli
    await page.getByPlaceholder(T.prereqName).nth(S.prereqs.length - 1).waitFor()
    for (const [title, cmd] of S.steps) {
      await page.getByRole('button', { name: T.step, exact: true }).click()
      await page.getByPlaceholder(T.stepTitle).last().fill(title)
      await page.getByPlaceholder(T.commands).last().fill(cmd)
    }
    for (const [key, example, notes] of S.env) {
      await page.getByRole('button', { name: T.envVar, exact: true }).click()
      await page.getByPlaceholder(T.varName).last().fill(key)
      await page.getByPlaceholder(T.varExample).last().fill(example)
      await page.getByPlaceholder(T.varNotes).last().fill(notes)
    }
    for (const [path, content] of S.files) {
      await page.getByRole('button', { name: T.file, exact: true }).click()
      await page.getByPlaceholder(T.filePath).last().fill(path)
      await page.getByPlaceholder(T.fileContent).last().fill(content)
    }
    await page.locator('form').first().evaluate((f) => f.scrollIntoView({ block: 'start' }))
    await frame('stack-edit', page.locator('form').first())
    await page.getByRole('button', { name: T.save, exact: true }).click()
    await page.getByTitle(T.markStepDone).first().click()
    await page.getByTitle(T.markStepDone).first().click()
    await shot('stack')
    await page.evaluate(() => document.querySelectorAll('main .overflow-y-auto').forEach((e) => (e.scrollTop = 0)))
    await frame('stack', page.locator('main h2').first())
    const setup = page.getByRole('heading', { name: T.setupTitle, level: 3 }).locator('xpath=ancestor::section[1]')
    await setup.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await frame('stack-setup', setup)

    // 4b) Nuovo progetto che parte da questo stack: nel dialog del progetto si sceglie «Copia da …»
    await page.getByRole('button', { name: T.project, exact: true }).click()
    await page.selectOption('#p-stack', { label: T.copyFrom(D.main.name) })
    await page.fill('#p-name', D.fromTemplate)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(dir, 'stack-template.png') })
    console.log(`  ${lang}/stack-template.png`)
    await frame('stack-template', dialog())
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })

    // 5) Strumenti AI: in fondo alla pagina Stack
    await page.getByRole('heading', { name: T.aiSection }).scrollIntoViewIfNeeded()
    for (const t of D.tools) {
      await page.getByRole('button', { name: T.newTool }).click()
      await page.getByRole('menuitem', { name: t.kind === 'skill' ? T.skill : T.connector }).click()
      await page.fill('#ai-name', t.name)
      if (t.url) await page.fill('#ai-url', t.url)
      await page.fill('#ai-notes', t.notes)
      if (t.content) await dialog().locator(`textarea[placeholder^="${T.pastePh}"]`).fill(t.content)
      await dialog().getByRole('button', { name: T.create, exact: true }).click()
      await dialog().waitFor({ state: 'hidden' })
    }
    await page.getByRole('heading', { name: T.aiSection }).evaluate((h) => h.scrollIntoView({ block: 'start' }))
    await shot('ai-tools', { top: false })

    // 6) Analisi e 7) Cronologia (amministratore)
    await wsMenu(T.analytics)
    await page.getByRole('heading', { name: T.analytics }).waitFor()
    await shot('analytics')
    await wsMenu(T.audit)
    await page.locator('main h1').waitFor()
    await shot('audit')

    // 8) Ricerca globale
    await openProject(D.main.name)
    await page.keyboard.press('Control+k')
    await page.keyboard.type(D.search, { delay: 30 })
    await page.getByRole('listbox').waitFor()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(dir, 'search.png') })
    console.log(`  ${lang}/search.png`)
    await frame('search', page.getByRole('listbox'), { settle: 100 })
    await page.keyboard.press('Escape')

    // Impostazioni › IA locale: prova della connessione con il motore (simulato)
    await page.locator('[data-workspace-menu]').click()
    await page.getByRole('menuitem', { name: T.settings }).click()
    await page.locator('[data-settings-tab="ai"]').click()
    // Attivandola, l'app trova da sola il motore e i modelli
    await page.locator('[data-ai-enabled]').check()
    await page.locator('[data-ai-status]').waitFor()
    await frame('ai-settings', dialog())
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })

    // 9) Nuovo elemento, tema scuro
    await page.keyboard.press('Control+Shift+L')
    await page.getByRole('button', { name: T.newItem }).click()
    await fillItem({ ...D.newItem, assign: true })
    await page.locator('#i-title').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(dir, 'new-item-dark.png') })
    console.log(`  ${lang}/new-item-dark.png`)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+Shift+L')
  } finally {
    await browser.close()
    // Con shell: true il server è un processo figlio della shell: si chiude l'intero albero.
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' })
      } catch {
        /* già chiuso */
      }
    } else proc.kill()
  }
}

const wanted = process.argv.slice(2).filter((l) => l in LANGS)
for (const lang of wanted.length ? wanted : Object.keys(LANGS)) {
  console.log(`Schermate ${lang}…`)
  await capture(lang)
}
process.exit(0)
