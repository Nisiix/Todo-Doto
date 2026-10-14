import { expect, test, type Page } from '@playwright/test'

/**
 * Flusso completo dell'utente, dall'avvio alla gestione di un progetto.
 * Gira sulla build Vite nel browser (filesystem in memoria): verifica
 * l'interfaccia e la logica insieme, senza il backend Tauri.
 */

// Qualsiasi errore JavaScript nella pagina fa fallire il test, anche se l'interfaccia sembra a posto
let pageErrors: string[] = []
test.beforeEach(({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
})
test.afterEach(() => expect(pageErrors).toEqual([]))

async function createLocalWorkspace(page: Page, name = 'Roadmap Sviluppo') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', name)
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

async function createProject(page: Page, name: string, folderLabel?: string) {
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', name)
  if (folderLabel) await page.selectOption('#p-folder', { label: folderLabel })
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

const newItemButton = (page: Page) => page.getByRole('button', { name: 'Nuovo task' })
const sidebar = (page: Page) => page.locator('aside').first()
/** Voce del sottomenu del progetto aperto nella barra laterale (Todo, Stack, Allegati). */
const openSection = (page: Page, name: 'Todo' | 'Stack' | 'Allegati') => sidebar(page).getByRole('link', { name: new RegExp(`^${name}( \\d+)?$`) }).click()
const openFilters = (page: Page) => page.getByRole('button', { name: /^Filtri/ }).click()
const rows = (page: Page) => page.locator('[role=button][tabindex="0"]')
const dialog = (page: Page) => page.getByRole('dialog')

async function addItem(page: Page, title: string, priority = 'media', opts: { notes?: string; label?: string } = {}) {
  await newItemButton(page).click()
  await page.fill('#i-title', title)
  if (opts.notes) await page.fill('#i-notes', opts.notes)
  await dialog(page).locator('select[title^="Priorità"]').selectOption(priority)
  if (opts.label) await dialog(page).getByLabel('Etichetta').selectOption({ label: opts.label })
  await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
}

test('schermata iniziale: nessun workspace, tema commutabile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Nessun workspace ancora')).toBeVisible()
  await page.keyboard.press('Control+Shift+L')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.keyboard.press('Control+Shift+L')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('workspace di rete: richiede password con conferma', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Rete')
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'diversa')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByText('Le due password non coincidono.')).toBeVisible()
  await page.fill('#ws-pw2', 'segreto1')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Rete' })).toBeVisible()
  await page.getByTitle('Membri del workspace').click()
  await expect(page.getByText('Chi apre questa cartella di rete')).toBeVisible()
  // Nuovo progetto: la scelta di accesso è esplicita
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await expect(page.getByRole('radio', { name: 'Tutti i membri del workspace' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Solo alcune persone' }).click()
  await expect(page.getByText('Nessun altro membro ancora')).toBeVisible()
})

test('sidebar: preferiti, recenti, cestino progetti e cartelle a cascata', async ({ page }) => {
  await createLocalWorkspace(page)
  const aside = page.locator('aside').first()
  await expect(aside.getByText('Segna un progetto con la stella')).toBeVisible()

  await page.getByTitle('Nuova cartella').click()
  await page.fill('input[placeholder="Nome cartella"]', 'Clienti')
  await page.getByRole('button', { name: 'Crea cartella' }).click()
  await createProject(page, 'Alpha', 'Clienti')
  await createProject(page, 'Beta')

  // Preferito: stella nell'intestazione → sezione Preferiti
  await page.getByRole('button', { name: 'Aggiungi ai preferiti' }).click()
  await expect(aside.locator('section').first().getByText('Beta')).toBeVisible()
  // Recenti: compare solo con almeno 5 progetti (con pochi è rumore)
  await expect(aside.locator('section', { hasText: 'Recenti' })).toHaveCount(0)
  for (const n of ['Gamma', 'Delta', 'Epsilon']) await createProject(page, n)
  const recenti = aside.locator('section', { hasText: 'Recenti' })
  await expect(recenti.locator('li').first()).toContainText('Epsilon')
  await aside.getByText('Beta', { exact: true }).first().click()

  // Sposta nel cestino dalla barra laterale: icona a destra della voce del progetto
  await aside.getByRole('link', { name: 'Beta' }).first().hover()
  await aside.getByRole('button', { name: 'Sposta «Beta» nel cestino' }).first().click()
  await expect(page.getByText('Questo progetto è nel cestino')).toBeVisible()
  const cestino = aside.locator('section', { hasText: 'Cestino' })
  await expect(cestino.getByText('Beta')).toBeVisible()
  await expect(newItemButton(page)).toBeHidden() // sola lettura
  // Ripristina dal banner
  await page.getByRole('button', { name: 'Ripristina' }).click()
  await expect(newItemButton(page)).toBeVisible()

  // Elimina la cartella: Alpha finisce nel cestino, poi svuota il cestino
  await aside.getByText('Clienti').hover()
  await aside.getByLabel('Azioni cartella').click()
  await page.getByText('Elimina cartella').click()
  await page.getByRole('button', { name: 'Elimina cartella' }).click()
  await expect(cestino.getByText('Alpha')).toBeVisible()
  await expect(aside.getByText('Clienti')).toBeHidden()
  await aside.getByLabel('Svuota cestino').click()
  await page.getByRole('button', { name: 'Svuota cestino' }).click()
  await expect(cestino.getByText('Vuoto.')).toBeVisible()
})

test('progetti: elementi, filtri, contenitori, dettaglio con Salva', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Progetto di test')

  // Inserimento tramite dialog: titolo + descrizione su più righe
  await newItemButton(page).click()
  await page.fill('#i-title', 'Refactor mapping NHibernate')
  await page.fill('#i-notes', 'prima riga')
  await page.locator('#i-notes').press('Enter')
  await page.locator('#i-notes').type('seconda riga')
  await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(rows(page).first()).toContainText('Refactor mapping NHibernate')
  await expect(rows(page).first()).not.toContainText('seconda riga')
  await addItem(page, 'Login SPID', 'immediata')
  await addItem(page, 'Export XBRL', 'alta')

  // Ordinati per priorità, con il nome dell'autore per intero
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(0)).toContainText('Login SPID')
  await expect(rows(page).nth(0)).toContainText('anteprima')

  // Filtri: per priorità, poi azzera
  await openFilters(page)
  await page.getByRole('group', { name: 'Filtri' }).getByRole('button', { name: 'Immediata' }).click()
  // Il filtro attivo compare come etichetta rimovibile accanto al pulsante
  await expect(page.getByRole('button', { name: 'Togli il filtro Immediata' })).toBeVisible()
  await expect(rows(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Azzera filtri' }).click()
  await expect(rows(page)).toHaveCount(3)

  // Ordine dei tab: Da fare, Completati, Allegati, Cestino
  // Contenitori: Da fare, Completati, Cestino; gli allegati sono una sezione del progetto
  const nav = page.getByRole('navigation', { name: 'Contenitori' })
  await expect(nav.locator('button').nth(2)).toContainText('Cestino')
  await expect(nav).not.toContainText('Allegati')

  // Completa il primo: in Completati non c'è il cerchio di spunta e il dettaglio è bloccato
  await rows(page).nth(0).getByTitle('Segna come completato').click()
  await expect(rows(page)).toHaveCount(2)
  await page.getByRole('button', { name: /^Completati/ }).click()
  await expect(rows(page).nth(0)).toContainText('Login SPID')
  await expect(rows(page).nth(0).getByTitle('Segna come completato')).toHaveCount(0)
  await rows(page).nth(0).getByText('Login SPID').click()
  await expect(page.getByText('Elemento completato: riaprilo per modificare.')).toBeVisible()
  await expect(page.getByLabel('Descrizione')).toBeDisabled()
  await expect(page.getByPlaceholder('Scrivi un commento')).toHaveCount(0)
  await page.getByRole('button', { name: 'Riapri' }).click()
  await expect(page.getByText('Elemento completato: riaprilo per modificare.')).toBeHidden()

  // Dettaglio: modifica titolo e note, poi Salva
  await page.getByRole('button', { name: /^Da fare/ }).click()
  await expect(rows(page)).toHaveCount(3)
  await rows(page).nth(2).getByText('Refactor mapping NHibernate').click()
  await expect(page.getByLabel('Descrizione')).toHaveValue(/seconda riga/)
  await page.getByLabel('Descrizione').fill('Validare con la tassonomia 2025')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(page.getByText('Salvato')).toBeVisible()

  // Cestina, poi elimina definitivamente dal cestino
  await rows(page).nth(1).hover()
  await rows(page).nth(1).getByLabel('Azioni').click()
  await page.getByRole('menuitem', { name: 'Sposta nel cestino' }).click()
  await page.getByRole('button', { name: /^Cestino/ }).click()
  await expect(rows(page)).toHaveCount(1)
  await rows(page).nth(0).hover()
  await rows(page).nth(0).getByLabel('Azioni').click()
  await page.getByText('Elimina definitivamente').click()
  await page.getByRole('button', { name: 'Elimina per sempre' }).click()
  await expect(page.getByText('Il cestino è vuoto')).toBeVisible()
})

test('etichette: gestione e assegnazione', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Etichette')
  await newItemButton(page).click()
  await dialog(page).getByRole('button', { name: 'Gestisci etichette…' }).click()
  const labels = page.getByRole('dialog').filter({ hasText: 'Badge da assegnare' })
  await expect(labels).toBeVisible()
  await labels.getByPlaceholder('Nuova etichetta').fill('Bug')
  await labels.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(labels.locator('input[aria-label="Nome etichetta Bug"]')).toBeVisible()
  await labels.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
  await expect(labels).toBeHidden()
  await page.fill('#i-title', 'Crash all’avvio')
  await dialog(page).getByLabel('Etichetta').selectOption({ label: 'Bug' })
  await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(rows(page).first().getByTitle('Etichetta: Bug').first()).toBeVisible()
  // Le etichette si gestiscono anche dal menu del workspace
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: 'Etichette' }).click()
  await expect(labels.locator('input[aria-label="Nome etichetta Bug"]')).toBeVisible()
  await labels.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
  // Filtro per etichetta
  await openFilters(page)
  await page.getByRole('group', { name: 'Filtri' }).getByLabel('Etichetta').selectOption({ label: 'Bug' })
  await expect(rows(page)).toHaveCount(1)
})

test('allegati: cartelle, link, file e anteprima interna', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Progetto allegati')
  await openSection(page, 'Allegati')
  await expect(page.getByRole('heading', { name: 'Allegati', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Cartella', exact: true }).click()
  await page.fill('input[placeholder="Es. Specifiche, Mockup, Contratti"]', 'Specifiche')
  await page.getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Specifiche' })).toBeVisible()

  await page.getByRole('button', { name: 'Allegato', exact: true }).click()
  await page.fill('#a-target', 'figma.com/file/abc')
  await page.fill('#a-name', 'Mockup')
  await page.selectOption('#a-folder', { label: 'Specifiche' })
  await page.getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(page.getByText('https://figma.com/file/abc')).toBeVisible()

  await page.getByRole('button', { name: 'Allegato', exact: true }).click()
  await page.getByRole('radio', { name: 'File' }).click()
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await expect(page.locator('#a-name')).toHaveValue('documento.pdf')
  await page.getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(page.getByText('documento.pdf', { exact: true })).toBeVisible()

  // Anteprima interna del link: riquadro incorporato + pulsante per il browser
  await page.getByRole('button', { name: 'Mockup' }).click()
  await expect(page.getByRole('dialog')).toContainText('Mockup')
  await expect(page.getByRole('dialog').locator('iframe')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Apri nel browser' })).toBeVisible()
  await page.getByRole('dialog').locator('button:has-text("Chiudi")').last().click()
})

test('ricerca globale e scorciatoie da tastiera', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Altro progetto')
  await addItem(page, 'Voce altrove')
  await createProject(page, 'Ricerca')
  await page.keyboard.press('n')
  await expect(page.locator('#i-title')).toBeFocused()
  await page.fill('#i-title', 'Prima cosa')
  await page.keyboard.press('Control+Enter')
  await expect(rows(page)).toHaveCount(1)
  await addItem(page, 'Seconda cosa')

  // Ricerca in tutti i progetti: risultati raggruppati, Invio apre l'elemento
  await page.keyboard.press('Control+k')
  await page.keyboard.type('voce')
  const results = page.getByRole('listbox', { name: 'Risultati della ricerca' })
  await expect(results).toContainText('Altro progetto')
  await expect(results).toContainText('Voce altrove')
  await expect(results).not.toContainText('Prima cosa')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Altro progetto' })).toBeVisible()
  await expect(page.getByLabel('Titolo')).toHaveValue('Voce altrove')
  await page.keyboard.press('Escape') // chiude il pannello

  // Tastiera nella lista: ↓ va alla prima riga, C completa, ? mostra l'elenco
  await page.locator('aside').first().getByText('Ricerca', { exact: true }).click()
  await expect(rows(page)).toHaveCount(2)
  await page.keyboard.press('ArrowDown')
  await expect(rows(page).first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('c')
  await expect(rows(page)).toHaveCount(1)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog')).toContainText('Scorciatoie da tastiera')
})

test('pagina Drive: nel browser spiega che serve l’app desktop', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.getByTitle('Google Drive').click()
  await expect(page.getByText('disponibile nell’app desktop')).toBeVisible()
})

test('membri: ruoli Admin, Cleaner, Membro e cronologia per l’admin', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Audit')
  await addItem(page, 'Da eliminare')
  await rows(page).first().hover()
  await rows(page).first().getByLabel('Azioni').click()
  await page.getByRole('menuitem', { name: 'Sposta nel cestino' }).click()
  await page.getByRole('button', { name: /^Cestino/ }).click()
  await rows(page).first().hover()
  await rows(page).first().getByLabel('Azioni').click()
  await page.getByRole('menuitem', { name: 'Elimina definitivamente' }).click()
  await page.getByRole('button', { name: 'Elimina per sempre' }).click()
  // Cronologia dal menu del workspace
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: 'Cronologia operazioni' }).click()
  await expect(page.getByRole('heading', { name: 'Cronologia' })).toBeVisible()
  await expect(page.getByText('Eliminato definitivamente: «Da eliminare»')).toBeVisible()
  await expect(page.getByText('Spostato nel cestino: «Da eliminare»')).toBeVisible()
  await expect(page.getByText('Elemento creato: «Da eliminare»')).toBeVisible()
  // Notifiche: pannello vuoto e preferenze nelle impostazioni
  await page.getByLabel('Notifiche').click()
  await expect(page.getByText('Nessuna notifica')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTitle('Impostazioni').click()
  await expect(page.getByText('Nuova domanda')).toBeVisible()
})

test('sezioni del progetto: Stack con procedura guidata e strumenti AI; Analisi per l’admin', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Stack test')
  await addItem(page, 'Elemento assegnato')

  // Stack: compilazione (admin) e procedura guidata
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Compila lo stack' }).click()
  await page.getByRole('button', { name: 'Desktop' }).click()
  await page.getByPlaceholder('Es. TypeScript, C#, Rust').fill('TypeScript')
  await page.keyboard.press('Enter')
  // TypeScript richiede Node.js: il prerequisito si aggiunge già compilato
  await expect(page.getByPlaceholder('Nome, es. Node.js')).toHaveValue('Node.js')
  await expect(page.getByPlaceholder('Comando di verifica, es. node -v')).toHaveValue('node -v')
  await page.getByRole('button', { name: 'Passo', exact: true }).click()
  await page.getByPlaceholder('Titolo del passo, es. Installa le dipendenze').fill('Installa le dipendenze')
  await page.getByPlaceholder('Uno o più comandi, uno per riga (es. npm install)').fill('npm install')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Stack salvato')).toBeVisible()
  await expect(page.getByText('TypeScript', { exact: true })).toBeVisible()
  await expect(page.getByText('0 di 2 completati')).toBeVisible()
  await page.getByTitle('Segna come fatto').first().click()
  await expect(page.getByText('1 di 2 completati')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Genera script Windows' })).toBeVisible()

  // Strumenti AI, ora nella pagina Stack: skill incollata, visibile nel visualizzatore
  await expect(page.getByRole('heading', { name: 'Strumenti AI' })).toBeVisible()
  await page.getByRole('button', { name: 'Nuovo strumento' }).click()
  await page.getByRole('menuitem', { name: 'Skill' }).click()
  await page.fill('#ai-name', 'frontend-design')
  await page.locator('textarea[placeholder^="…oppure incolla"]').fill('# Frontend Design\nLinee guida')
  await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(page.getByTitle('Vedi SKILL.md')).toBeVisible()
  await page.getByTitle('Vedi SKILL.md').click()
  await expect(dialog(page).locator('pre')).toContainText('Linee guida')
  await dialog(page).getByRole('button', { name: 'Chiudi', exact: true }).last().click()

  // Analisi dal menu del workspace
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: 'Analisi' }).click()
  await expect(page.getByRole('heading', { name: 'Analisi' })).toBeVisible()
  await expect(page.getByText('Carico per utente')).toBeVisible()
  await expect(page.getByRole('main').getByText('Stack test')).toBeVisible()
})

test('stack come modello: nuovo progetto con lo stack copiato e cartella del progetto', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Modello web')
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Compila lo stack' }).click()
  await page.getByPlaceholder('Es. TypeScript, C#, Rust').fill('TypeScript')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Passo', exact: true }).click()
  await page.getByPlaceholder('Titolo del passo, es. Installa le dipendenze').fill('Clona il repository')
  await page.getByPlaceholder('Uno o più comandi, uno per riga (es. npm install)').fill('git clone https://example.com/modello-web.git')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByPlaceholder('Percorso, es. package.json o src/main.ts').fill('package.json')
  await page.getByPlaceholder('Contenuto del file').fill('{ "name": "{{slug}}" }')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(page.getByText('Stack salvato')).toBeVisible()

  // Nuovo progetto da questo stack: si chiede solo il nome, lo stack è preselezionato
  await page.getByRole('button', { name: 'Nuovo progetto con questo stack' }).click()
  await expect(page.locator('#p-stack')).toHaveValue(/.+/)
  await page.fill('#p-name', 'Nuovo portale')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name: 'Nuovo portale' })).toBeVisible()
  await expect(page.getByText('git clone https://example.com/nuovo-portale.git')).toBeVisible()
  await expect(page.getByText('package.json', { exact: true })).toBeVisible()

  // Cartella del progetto: README, script e file iniziali; diventa la cartella del progetto
  await page.getByRole('button', { name: 'Crea cartella del progetto' }).first().click()
  await expect(dialog(page)).toContainText('README.md, setup-nuovo-portale.cmd, package.json')
  await dialog(page).getByRole('button', { name: 'Crea cartella' }).click()
  await expect(page.getByText(/Cartella del progetto creata \(3 file\)/)).toBeVisible()
  await expect(page.locator('code', { hasText: /nuovo-portale$/ })).toBeVisible()

  // Importazione dello stack in un progetto esistente, durante la modifica
  await createProject(page, 'Altro')
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Compila lo stack' }).click()
  await page.getByRole('button', { name: 'Importa da…' }).click()
  await page.getByRole('menuitem', { name: 'Modello web' }).click()
  await expect(page.getByPlaceholder('Uno o più comandi, uno per riga (es. npm install)')).toHaveValue('git clone https://example.com/altro.git')
})

test('barra laterale: sottomenu del progetto; nessun cestino nelle sezioni; impostazioni con l’ingranaggio', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Uno')
  const submenu = sidebar(page).getByRole('list', { name: 'Sezioni di Uno' })
  await expect(submenu.getByRole('link')).toHaveText([/^Todo/, /^Stack/, /^Allegati/])
  for (const s of ['Todo', 'Stack', 'Allegati'] as const) {
    await openSection(page, s)
    // Il pulsante per cestinare il progetto non è più nell'intestazione delle sezioni
    await expect(page.getByRole('main').getByRole('button', { name: /nel cestino/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Impostazioni progetto' })).toBeVisible()
  }
  // Il vecchio indirizzo della sezione Strumenti AI porta allo Stack
  await page.goto(page.url().replace(/\/attachments$/, '/ai'))
  await expect(page.getByRole('heading', { name: 'Stack e configurazione' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Strumenti AI' })).toBeVisible()
  // Il sottomenu compare solo per il progetto aperto
  await createProject(page, 'Due')
  await expect(sidebar(page).getByRole('list', { name: 'Sezioni di Uno' })).toHaveCount(0)
  await expect(sidebar(page).getByRole('list', { name: 'Sezioni di Due' })).toBeVisible()
})

test('stack: prerequisiti compilati in automatico, salvataggio e import di un documento .md', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Portale')
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Compila lo stack' }).click()
  await expect(page.getByText('Nessuna modifica')).toBeVisible()

  // Un linguaggio che richiede strumenti: i prerequisiti si aggiungono da soli
  await page.getByPlaceholder('Es. TypeScript, C#, Rust').fill('Rust')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Prerequisiti aggiunti in automatico: Rust, Visual Studio Build Tools')).toBeVisible()
  await expect(page.getByText('Modifiche non salvate')).toBeVisible()
  const names = page.getByPlaceholder('Nome, es. Node.js')
  await expect(names).toHaveCount(2)
  // Un nome noto completa link e comando di verifica
  await page.getByRole('button', { name: 'Prerequisito', exact: true }).click()
  await names.last().fill('nodejs')
  await names.last().blur()
  await expect(names.last()).toHaveValue('Node.js')
  await expect(page.getByPlaceholder('Comando di verifica, es. node -v').last()).toHaveValue('node -v')
  // Un prerequisito tolto a mano non viene riproposto in automatico, ma resta tra i suggeriti
  await page.getByRole('button', { name: 'Rimuovi' }).nth(1).click()
  await expect(page.getByRole('button', { name: 'Visual Studio Build Tools' })).toBeVisible()
  // Ctrl+S salva
  await page.keyboard.press('Control+s')
  await expect(page.getByText('Stack salvato')).toBeVisible()

  // Import di un documento di architettura: precompila e memorizza il documento
  const md = [
    '# Portale',
    '## Architettura',
    'Frontend Vue 3 con API Express su PostgreSQL. Repository: https://github.com/example/portale',
    '## Prerequisiti',
    '- PostgreSQL 16',
    '## Avvio',
    '1. Installa le dipendenze',
    '   ```',
    '   npm install',
    '   ```',
    '## Variabili d’ambiente',
    '| Variabile | Esempio |',
    '|---|---|',
    '| `DATABASE_URL` | `postgres://localhost/portale` |',
  ].join('\n')
  await page.locator('input[data-md-input]').setInputFiles({ name: 'ARCHITETTURA.md', mimeType: 'text/markdown', buffer: Buffer.from(md) })
  await expect(page.getByText(/Da «ARCHITETTURA\.md»: .*1 passi.*Controlla e salva/)).toBeVisible()
  await expect(page.locator('#st-repo')).toHaveValue('https://github.com/example/portale')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(page.getByText('Stack salvato').last()).toBeVisible()
  await expect(page.getByText('Documento di architettura:')).toBeVisible()
  await expect(page.getByText('npm install', { exact: true })).toBeVisible()
  await expect(page.getByText('DATABASE_URL', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Vedi documento' }).click()
  await expect(dialog(page).locator('pre')).toContainText('Frontend Vue 3')
})

test('workspace da una cartella di progetti: propone di crearli e chiede un’altra cartella per il workspace', async ({ page }) => {
  await page.goto('/')
  // Una cartella con due progetti e una cartella qualunque (filesystem in memoria dell'anteprima)
  await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic('/progetti/alfa/package.json', JSON.stringify({ dependencies: { vue: '^3.5.0' }, devDependencies: { typescript: '^5' } }))
    await fs.writeTextAtomic('/progetti/beta/Cargo.toml', '[package]\nname = "beta"')
    await fs.writeTextAtomic('/progetti/documenti/appunti.txt', 'note')
  })
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Roadmap')
  await page.fill('#ws-path', '/progetti')
  const box = page.locator('[data-found-projects]')
  await expect(box).toContainText('Questa cartella contiene 2 progetti')
  await expect(box.getByRole('checkbox')).toHaveCount(3) // "crea i progetti" + alfa + beta
  await expect(box).not.toContainText('documenti')
  await expect(page.getByText('Cartella dei progetti')).toBeVisible()

  // Il workspace va salvato in un'altra cartella, non dentro un progetto
  const create = page.getByRole('button', { name: 'Crea workspace' }).last()
  await create.click()
  await expect(page.getByText('Scegli una cartella diversa da quella dei progetti in cui salvare il workspace.')).toBeVisible()
  await page.fill('#ws-data', '/progetti')
  await create.click()
  await expect(page.getByText('La cartella del workspace deve essere diversa da quella dei progetti.')).toBeVisible()
  await page.fill('#ws-data', '/progetti/alfa/roadmap')
  await create.click()
  await expect(page.getByText('La cartella del workspace non può stare dentro il progetto «alfa».')).toBeVisible()
  await page.fill('#ws-data', '/dati/roadmap')
  await create.click()

  await expect(page.getByRole('heading', { name: 'Roadmap' })).toBeVisible()
  await expect(page.getByText('2 progetti creati dalla cartella')).toBeVisible()
  await sidebar(page).getByRole('link', { name: 'alfa' }).click()
  await openSection(page, 'Stack')
  await expect(page.getByText('/progetti/alfa', { exact: true })).toBeVisible()
  await expect(page.getByText('Vue 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Prerequisito: Node.js')).toBeVisible()
})
