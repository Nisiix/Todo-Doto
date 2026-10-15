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

/** Cartella dei progetti e cartella Dati Todo Doto, con i pulsanti Sfoglia del dialog. */
async function pickWorkspaceFolders(page: Page) {
  await page.getByRole('button', { name: 'Scegli la cartella dei progetti' }).click()
  await page.getByRole('button', { name: 'Scegli la cartella Dati Todo Doto' }).click()
}

async function createLocalWorkspace(page: Page, name = 'Roadmap Sviluppo') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', name)
  await pickWorkspaceFolders(page)
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

async function createProject(page: Page, name: string, folderLabel?: string) {
  if (folderLabel) {
    // Nella cartella della barra laterale: dal menu della cartella
    await page.locator('aside').first().getByText(folderLabel, { exact: true }).hover()
    await page.locator('aside').first().getByLabel('Azioni cartella').click()
    await page.getByText('Nuovo progetto qui').click()
  } else await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', name)
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

/** Esiti simulati dei comandi di verifica dei prerequisiti (nel browser i comandi non si eseguono). */
async function fakeChecks(page: Page, results: Record<string, { code: number | null; stdout?: string; stderr?: string; timedOut?: boolean }>) {
  await page.evaluate((r) => {
    const all = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { stdout: '', stderr: '', timedOut: false, ...v }]))
    Object.assign(window, { __pgmChecks: all })
  }, results)
}

const newItemButton = (page: Page) => page.getByRole('button', { name: 'Nuovo task' })
const sidebar = (page: Page) => page.locator('aside').first()
/** Voce del sottomenu del progetto aperto nella barra laterale (Todo, Stack, Allegati). */
const openSection = (page: Page, name: 'Todo' | 'Gantt' | 'Stack' | 'Allegati') => sidebar(page).getByRole('link', { name: new RegExp(`^${name}( \\d+)?$`) }).click()
const openFilters = (page: Page) => page.getByRole('button', { name: /^Filtri/ }).click()
const rows = (page: Page) => page.locator('[role=button][tabindex="0"]')
const dialog = (page: Page) => page.getByRole('dialog')

async function addItem(page: Page, title: string, priority = 'media', opts: { notes?: string; label?: string } = {}) {
  await newItemButton(page).click()
  await page.fill('#i-title', title)
  if (opts.notes) await page.fill('#i-notes', opts.notes)
  await dialog(page).locator('#i-priority').selectOption(priority)
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
  await pickWorkspaceFolders(page)
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'diversa')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByText('Le due password non coincidono.')).toBeVisible()
  await page.fill('#ws-pw2', 'segreto1')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Rete' })).toBeVisible()
  await page.getByTitle('Membri del workspace', { exact: true }).click()
  await expect(page.getByText('Chi apre questa cartella di rete')).toBeVisible()
  // Nuovo progetto: visibilità pubblica (predefinita) o limitata
  const aside = page.locator('aside').first()
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await expect(page.getByRole('radio', { name: 'Pubblica' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Limitata' }).click()
  await expect(page.getByText('Nessun altro membro ancora: per ora lo vedono solo gli amministratori.')).toBeVisible()
  await page.fill('#p-name', 'Riservato')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name: 'Riservato' })).toBeVisible()
  // Pallino dopo il nome nella barra laterale: arancione = limitata
  await expect(aside.getByRole('link', { name: /Riservato/ }).locator('[data-visibility]')).toHaveAttribute('data-visibility', 'restricted')
  await expect(page.locator('[data-visibility-button]')).toContainText('Limitata')

  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', 'Condiviso')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name: 'Condiviso' })).toBeVisible()
  await expect(aside.getByRole('link', { name: /Condiviso/ }).locator('[data-visibility]')).toHaveAttribute('data-visibility', 'public')
  await expect(page.getByRole('button', { name: 'Gestione utenti' })).toHaveCount(0)

  // Nel progetto: l'amministratore cambia la visibilità dall'intestazione
  await page.locator('[data-visibility-button]').click()
  await page.getByRole('menuitem', { name: 'Limitata: solo utenti scelti' }).click()
  await expect(page.getByText('Progetto limitato: per ora visibile solo agli amministratori')).toBeVisible()
  await expect(aside.getByRole('link', { name: /Condiviso/ }).locator('[data-visibility]')).toHaveAttribute('data-visibility', 'restricted')
  await page.locator('[data-visibility-button]').click()
  await page.getByRole('menuitem', { name: 'Pubblica: visibile a tutti' }).click()
  await expect(aside.getByRole('link', { name: /Condiviso/ }).locator('[data-visibility]')).toHaveAttribute('data-visibility', 'public')

  // Gestione permessi (Membri): solo i progetti limitati; quelli pubblici non si selezionano
  await page.getByTitle('Membri del workspace', { exact: true }).click()
  await page.getByRole('button', { name: 'Gestione permessi' }).click()
  await expect(dialog(page)).toContainText('Gestione permessi')
  await expect(dialog(page).locator('#perm-filter')).toContainText('Riservato')
  await expect(dialog(page).locator('#perm-filter')).not.toContainText('Condiviso')
  await expect(dialog(page).locator('[data-public-count]')).toContainText('1 progetto pubblico')
  // Solo l'admin nel workspace: nessun altro a cui dare permessi
  await expect(dialog(page)).toContainText('Nessun altro membro ancora')
  await expect(dialog(page).getByRole('button', { name: 'Salva' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Dal menu della visibilità di un progetto limitato si arriva ai suoi permessi
  await aside.getByRole('link', { name: /Riservato/ }).click()
  await page.locator('[data-visibility-button]').click()
  await page.getByRole('menuitem', { name: 'Scegli gli utenti…' }).click()
  await expect(dialog(page)).toContainText('Gestione permessi')
  await expect(dialog(page).locator('#perm-filter')).toHaveValue(/.+/)
})

test('workspace di rete: “Ricorda la password” a scelta, cambio password dell’admin', async ({ page }) => {
  const reopen = async () => {
    await page.getByRole('button', { name: /^Rete2/ }).first().click()
    await page.getByRole('menuitem', { name: 'Chiudi workspace' }).click()
    await page.locator('li', { hasText: 'Rete2' }).getByRole('button').first().click()
  }
  const pwDialog = () => page.getByRole('dialog').filter({ hasText: 'Workspace protetto' })

  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Rete2')
  await pickWorkspaceFolders(page)
  // In locale non c'è nessuna password né opzione per ricordarla
  await expect(page.locator('#ws-pw')).toHaveCount(0)
  await expect(page.getByLabel(/Ricorda la password/)).toHaveCount(0)
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'segreto1')
  // Non spuntata: la password non resta su questo PC
  await expect(page.getByLabel(/Ricorda la password su questo PC/)).not.toBeChecked()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Rete2' })).toBeVisible()

  // Riapertura: viene chiesta, con l'opzione per ricordarla (non spuntata)
  await reopen()
  await expect(pwDialog()).toBeVisible()
  await expect(pwDialog().getByLabel('Ricorda la password su questo PC')).not.toBeChecked()
  await page.fill('#pw', 'sbagliata')
  await pwDialog().getByRole('button', { name: 'Entra' }).click()
  await expect(pwDialog()).toContainText('Password non corretta')
  await page.fill('#pw', 'segreto1')
  await pwDialog().getByLabel('Ricorda la password su questo PC').check()
  await pwDialog().getByRole('button', { name: 'Entra' }).click()
  await expect(page.getByRole('heading', { name: 'Rete2' })).toBeVisible()

  // Ricordata: la riapertura non la chiede; le Impostazioni lo dicono
  await reopen()
  await expect(page.getByRole('heading', { name: 'Rete2' })).toBeVisible()
  await page.getByTitle('Impostazioni', { exact: true }).click()
  await expect(page.getByText(/Ricordata su questo PC, cifrata/)).toBeVisible()

  // Admin: cambia la password del workspace (resta ricordata, aggiornata)
  await page.getByRole('textbox', { name: 'Nuova password' }).fill('nuova-pw')
  await page.getByRole('textbox', { name: 'Ripeti' }).fill('nuova-pw')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(page.getByText(/Password aggiornata/)).toBeVisible()
  await reopen()
  await expect(page.getByRole('heading', { name: 'Rete2' })).toBeVisible()

  // "Dimentica su questo PC": al prossimo accesso viene richiesta, la vecchia non vale
  await page.getByTitle('Impostazioni', { exact: true }).click()
  await page.getByRole('button', { name: 'Dimentica su questo PC' }).click()
  await expect(page.getByText(/Non ricordata su questo PC/)).toBeVisible()
  await page.keyboard.press('Escape')
  await reopen()
  await page.fill('#pw', 'segreto1')
  await pwDialog().getByRole('button', { name: 'Entra' }).click()
  await expect(pwDialog()).toContainText('Password non corretta')
  await page.fill('#pw', 'nuova-pw')
  await pwDialog().getByRole('button', { name: 'Entra' }).click()
  await expect(page.getByRole('heading', { name: 'Rete2' })).toBeVisible()
})

test('sidebar: preferiti, recenti, cestino progetti e cartelle a cascata', async ({ page }) => {
  await createLocalWorkspace(page)
  const aside = page.locator('aside').first()
  // Nessun preferito: la sezione Preferiti non c'è
  await expect(aside.locator('[data-favorites]')).toHaveCount(0)
  // Cestino vuoto: la sezione non c'è proprio
  await expect(aside.locator('section', { hasText: 'Cestino' })).toHaveCount(0)

  await page.getByTitle('Nuova cartella').click()
  await page.fill('input[placeholder="Nome cartella"]', 'Clienti')
  await page.getByRole('button', { name: 'Crea cartella' }).click()
  await createProject(page, 'Alpha', 'Clienti')
  await createProject(page, 'Beta')

  // Preferito: stella nell'intestazione → sezione Preferiti
  await page.getByRole('button', { name: 'Aggiungi ai preferiti' }).click()
  await expect(aside.locator('[data-favorites]').getByText('Beta')).toBeVisible()
  // Tolto l'ultimo preferito, la sezione sparisce di nuovo
  await page.getByRole('button', { name: 'Togli dai preferiti' }).click()
  await expect(aside.locator('[data-favorites]')).toHaveCount(0)
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
  // Si dice chiaramente che la cartella del progetto sul disco non viene toccata
  await expect(page.getByText('Progetto spostato nel cestino del workspace. La sua cartella sul disco non viene toccata.')).toBeVisible()
  await expect(page.getByText(/nel cestino del workspace dal .*La cartella del progetto sul disco non viene toccata/)).toBeVisible()
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
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText('Nessuna cartella o file sul disco viene toccato.')
  await page.getByRole('button', { name: 'Elimina cartella' }).click()
  await expect(cestino.getByText('Alpha')).toBeVisible()
  await expect(aside.getByText('Clienti')).toBeHidden()
  await aside.getByLabel('Svuota cestino').click()
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText('Le cartelle dei progetti e i loro file sul disco non vengono toccati.')
  await page.getByRole('button', { name: 'Svuota cestino' }).click()
  // Vuoto: la sezione Cestino non compare più
  await expect(cestino).toHaveCount(0)
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

  // Nella riga i badge sono solo da vedere: niente menu a tendina né data modificabile
  await expect(rows(page).first().locator('select, input[type=date]')).toHaveCount(0)

  // Anche gli attributi (priorità, stato…) aspettano «Salva» e si annullano con «Annulla»
  const panel = page.locator('aside').last()
  const detailPriority = panel.locator('#d-priority')
  const before = await detailPriority.inputValue()
  const other = before === 'immediata' ? 'bassa' : 'immediata'
  await detailPriority.selectOption(other)
  await expect(panel.locator('[data-detail-save]')).toContainText('Modifiche non salvate')
  await panel.getByRole('button', { name: 'Annulla', exact: true }).click()
  await expect(detailPriority).toHaveValue(before)
  await expect(panel.locator('[data-detail-save]')).toHaveCount(0)
  await detailPriority.selectOption(other)
  await panel.locator('#d-status').selectOption('confermato')
  // Salva e Annulla a destra
  const box = await panel.locator('[data-detail-save]').boundingBox()
  const saveBtn = await panel.getByRole('button', { name: 'Salva', exact: true }).boundingBox()
  expect(saveBtn!.x + saveBtn!.width).toBeGreaterThan(box!.x + box!.width - 4)
  await panel.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(panel.locator('[data-detail-save]')).toHaveCount(0)
  await expect(detailPriority).toHaveValue(other)
  await expect(panel.locator('#d-status')).toHaveValue('confermato')

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
  // Dati inseriti prima di passare alle etichette
  await page.fill('#i-title', 'Crash all’avvio')
  await page.fill('#i-notes', 'Succede solo al primo avvio')
  await dialog(page).locator('#i-priority').selectOption('alta')
  await dialog(page).getByRole('button', { name: 'Gestisci etichette…' }).click()
  const labels = page.getByRole('dialog').filter({ hasText: 'Badge da assegnare' })
  await expect(labels).toBeVisible()
  await labels.getByPlaceholder('Nuova etichetta').fill('Bug')
  await labels.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(labels.locator('input[aria-label="Nome etichetta Bug"]')).toBeVisible()
  // Il nuovo task lascia spazio alle etichette…
  await expect(page.locator('#i-title')).toHaveCount(0)
  await labels.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
  await expect(labels).toBeHidden()
  // …e alla chiusura torna con quanto già inserito
  await expect(page.locator('#i-title')).toHaveValue('Crash all’avvio')
  await expect(page.locator('#i-notes')).toHaveValue('Succede solo al primo avvio')
  await expect(dialog(page).locator('#i-priority')).toHaveValue('alta')
  await dialog(page).getByLabel('Etichetta').selectOption({ label: 'Bug' })
  await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(rows(page).first().getByTitle('Etichetta: Bug').first()).toBeVisible()
  // Un nuovo task successivo riparte vuoto
  await newItemButton(page).click()
  await expect(page.locator('#i-title')).toHaveValue('')
  await page.keyboard.press('Escape')
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

  // Stack: compilazione (admin) e procedura guidata. Node.js non è installato (comando non riconosciuto)
  await fakeChecks(page, { 'node -v': { code: 9009, stderr: "'node' is not recognized as an internal or external command" } })
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Aggiungi stack tecnologico' }).click()
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
  // Verifica automatica: Node.js manca → segnalato, la configurazione automatica è bloccata
  const node = page.locator('[data-prereq="Node.js"]')
  await expect(node).toHaveAttribute('data-status', 'missing')
  await expect(node).toContainText('Non trovato su questo PC: va installato')
  await expect(page.locator('[data-prereq-summary]')).toHaveText('1 da installare o aggiornare')
  await page.getByTitle('Segna come fatto').first().click() // il passo
  await expect(page.getByText('1 di 2 completati')).toBeVisible()
  await page.getByRole('button', { name: 'Gestisci configurazione automatica' }).click()
  await expect(dialog(page)).toContainText('Configurazione automatica di Stack test')
  await expect(dialog(page)).toContainText('npm install')
  await expect(dialog(page).locator('[data-auto-blocked]')).toContainText('Node.js')
  await expect(dialog(page).getByRole('button', { name: 'Avvia configurazione' })).toBeDisabled()
  await expect(dialog(page).getByRole('button', { name: 'Salva lo script…' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Esito incerto (errore senza versione): segnalato; si sblocca solo confermandolo a mano
  await fakeChecks(page, { 'node -v': { code: 1, stderr: 'errore imprevisto' } })
  await page.getByRole('button', { name: 'Ricontrolla', exact: true }).click()
  await expect(node).toHaveAttribute('data-status', 'failed')
  await expect(node).toContainText('Verifica non riuscita: controlla a mano')
  await expect(page.locator('[data-prereq-summary]')).toHaveText('1 da verificare a mano')
  await page.getByTitle('Confermo che è installato e va bene').click()
  await expect(page.getByText('2 di 2 completati')).toBeVisible()

  // Versione vecchia: va aggiornato, la conferma a mano non basta
  await fakeChecks(page, { 'node -v': { code: 0, stdout: 'v18.19.0' } })
  await page.getByRole('button', { name: 'Ricontrolla', exact: true }).click()
  await expect(node).toContainText('Installata la 18.19.0, serve 20+: va aggiornato')
  await expect(page.getByText('1 di 2 completati')).toBeVisible()

  // Versione giusta: verificato e spuntato da solo
  await fakeChecks(page, { 'node -v': { code: 0, stdout: 'v20.11.0' } })
  await page.getByRole('button', { name: 'Ricontrolla', exact: true }).click()
  await expect(node).toContainText('Installato · 20.11.0')
  await expect(page.getByText('2 di 2 completati')).toBeVisible()
  await expect(page.locator('[data-prereq-summary]')).toHaveText('1 installato')

  // Configurazione automatica: nessun blocco, avvio (nel browser: solo app desktop)
  await page.getByRole('button', { name: 'Gestisci configurazione automatica' }).click()
  await expect(dialog(page).locator('[data-auto-blocked]')).toHaveCount(0)
  await dialog(page).getByRole('button', { name: 'Avvia configurazione' }).click()
  await expect(page.getByText(/disponibile nell’app desktop/)).toBeVisible()
  await page.keyboard.press('Escape')

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

test('stack come modello: cartella creata con il progetto, import dello stack da un altro progetto', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Modello web')
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Aggiungi stack tecnologico' }).click()
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

  // Nuovo progetto con lo stack copiato: la cartella del progetto viene creata subito,
  // con README, script di configurazione e file iniziali dello stack
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', 'Nuovo portale')
  await page.locator('#p-stack').selectOption({ label: 'Copia da «Modello web»' })
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name: 'Nuovo portale' })).toBeVisible()
  await expect(page.getByText('Cartella del progetto creata (3 file)')).toBeVisible()
  await expect(page.getByText('git clone https://example.com/nuovo-portale.git')).toBeVisible()
  await expect(page.locator('code', { hasText: /Nuovo portale$/ })).toBeVisible()
  const pkg = await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ readText(p: string): Promise<string> }> }).__pgmFs()
    const dir = document.querySelector('code')?.textContent?.trim() ?? ''
    return fs.readText(`${dir}/package.json`).catch(() => '')
  })
  expect(pkg).toContain('nuovo-portale')
  // Nello Stack non c'è più «Crea cartella del progetto» né «Nuovo progetto con questo stack»
  await expect(page.getByRole('button', { name: 'Crea cartella del progetto' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nuovo progetto con questo stack' })).toHaveCount(0)

  // Importazione dello stack da un altro progetto esistente: si entra in modifica con i dati importati
  await createProject(page, 'Altro')
  await openSection(page, 'Stack')
  await expect(page.getByRole('button', { name: 'Aggiungi stack tecnologico' })).toBeVisible()
  await page.getByRole('button', { name: 'Importa stack da altro progetto' }).click()
  await page.getByRole('menuitem', { name: 'Modello web' }).click()
  await expect(page.getByPlaceholder('Uno o più comandi, uno per riga (es. npm install)')).toHaveValue('git clone https://example.com/altro.git')
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(page.getByText('Stack salvato').last()).toBeVisible()
  // Stack presente: il pulsante torna «Modifica»
  await expect(page.getByRole('button', { name: 'Aggiungi stack tecnologico' })).toHaveCount(0)
})

test('barra laterale: sottomenu del progetto; nessun cestino né modifica del nome nelle sezioni', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Uno')
  const submenu = sidebar(page).getByRole('list', { name: 'Sezioni di Uno' })
  await expect(submenu.getByRole('link')).toHaveText([/^Todo/, /^Gantt/, /^Stack/, /^Allegati/])
  for (const s of ['Todo', 'Gantt', 'Stack', 'Allegati'] as const) {
    await openSection(page, s)
    // Il pulsante per cestinare il progetto non è più nell'intestazione delle sezioni
    await expect(page.getByRole('main').getByRole('button', { name: /nel cestino/i })).toHaveCount(0)
    // Né ingranaggio né matita: il nome è quello della cartella del progetto
    await expect(page.getByRole('button', { name: 'Impostazioni progetto' })).toHaveCount(0)
    await expect(page.locator('[data-edit-project]')).toHaveCount(0)
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
  await page.getByRole('button', { name: 'Aggiungi stack tecnologico' }).click()
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
  await expect(page.getByText(/Da «ARCHITETTURA\.md»: .*\d passi.*Controlla e salva/)).toBeVisible()
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

  // Il workspace va salvato in un'altra cartella, non dentro un progetto
  const create = page.getByRole('button', { name: 'Crea workspace' }).last()
  await create.click()
  await expect(page.getByText('Indica la cartella Dati Todo Doto, diversa da quella dei progetti.')).toBeVisible()
  await page.fill('#ws-data', '/progetti')
  await create.click()
  await expect(page.getByText('La cartella Dati Todo Doto deve essere diversa dalla cartella dei progetti.')).toBeVisible()
  await page.fill('#ws-data', '/progetti/alfa/roadmap')
  await create.click()
  await expect(page.getByText('La cartella Dati Todo Doto non può stare dentro il progetto «alfa».')).toBeVisible()
  await page.fill('#ws-data', '/dati/roadmap')
  await create.click()

  await expect(page.getByRole('heading', { name: 'Roadmap' })).toBeVisible()
  await expect(page.getByText('2 progetti creati dalla cartella')).toBeVisible()
  await sidebar(page).getByRole('link', { name: 'alfa' }).click()
  await openSection(page, 'Stack')
  await expect(page.getByText('/progetti/alfa', { exact: true })).toBeVisible()
  // Collegato a una cartella esistente: niente matita
  await expect(page.locator('[data-edit-project]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Crea cartella del progetto' })).toHaveCount(0)
  await expect(page.getByText('Vue 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Prerequisito: Node.js')).toBeVisible()
})

test('cartella dei progetti e cartella Dati: recenti, impostazioni, nuovi progetti, eliminazione dei dati', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Sviluppo')
  await page.fill('#ws-path', '/sviluppo')
  await expect(page.getByText('Nessun progetto trovato: la cartella verrà usata per i progetti che creerai.')).toBeVisible()
  // La cartella Dati è obbligatoria anche senza progetti; c'è un suggerimento accanto
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByText('Indica la cartella Dati Todo Doto, diversa da quella dei progetti.')).toBeVisible()
  await page.getByRole('button', { name: /^Usa / }).click()
  await expect(page.locator('#ws-data')).toHaveValue('/sviluppo/Todo Doto')
  await page.fill('#ws-data', '/pgm/sviluppo')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Sviluppo' })).toBeVisible()

  // Nuovo progetto: la cartella sul disco è proposta dentro la cartella dei progetti
  await page.getByRole('button', { name: 'Progetto', exact: true }).click()
  await page.fill('#p-name', 'Portale')
  await expect(page.locator('#p-disk')).toHaveValue('/sviluppo/Portale')
  await expect(page.locator('#p-desc')).toHaveCount(0)
  await expect(page.locator('#p-folder')).toHaveCount(0)
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await openSection(page, 'Stack')
  await page.getByRole('button', { name: 'Aggiungi stack tecnologico' }).click()
  await expect(page.locator('#st-src')).toHaveValue('/sviluppo/Portale')
  await page.getByRole('button', { name: 'Annulla', exact: true }).click()

  // Impostazioni: le due cartelle
  await page.getByTitle('Impostazioni', { exact: true }).click()
  await expect(page.locator('#s-projects')).toHaveValue('/sviluppo')
  await expect(page.locator('[data-data-folder]')).toHaveText('/pgm/sviluppo')
  await page.keyboard.press('Escape')

  // Recenti: si vede la cartella dei progetti, non quella dei dati
  await page.getByRole('button', { name: 'Sviluppo' }).first().click()
  await page.getByRole('menuitem', { name: 'Chiudi workspace' }).click()
  await expect(page.locator('[data-recent-path]')).toHaveText('/sviluppo')

  // Elimina i dati di Todo Doto (workspace locale): i progetti restano
  await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic('/sviluppo/Portale/README.md', '# Portale')
  })
  await page.locator('li', { hasText: 'Sviluppo' }).hover()
  await page.getByRole('button', { name: 'Azioni workspace' }).click()
  await page.getByRole('menuitem', { name: 'Elimina i dati di Todo Doto' }).click()
  await expect(dialog(page)).toContainText('/pgm/sviluppo')
  await expect(dialog(page)).toContainText('non vengono toccati')
  await dialog(page).getByRole('button', { name: 'Elimina i dati' }).click()
  await expect(page.getByText('Dati del workspace «Sviluppo» eliminati')).toBeVisible()
  await expect(page.locator('[data-recent-path]')).toHaveCount(0)
  const left = await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ exists(p: string): Promise<boolean> }> }).__pgmFs()
    return { data: await fs.exists('/pgm/sviluppo/workspace.json'), project: await fs.exists('/sviluppo/Portale/README.md') }
  })
  expect(left).toEqual({ data: false, project: true })
})

test('nome del progetto: è quello della cartella, si decide alla creazione e poi non si cambia', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await expect(page.locator('[data-name-hint]')).toContainText('Il nome del progetto è il nome della sua cartella')
  // Scrivendo il nome si propone la cartella <cartella dei progetti>/<nome>
  await page.fill('#p-name', 'Bozza')
  await expect(page.locator('#p-disk')).toHaveValue(/[\\/]Bozza$/)
  // Scegliendo una cartella il progetto ne prende il nome
  await page.getByRole('button', { name: 'Scegli la cartella del progetto' }).click()
  const chosen = await page.locator('#p-disk').inputValue()
  const folder = chosen.split(/[\\/]/).pop()!
  await expect(page.locator('#p-name')).toHaveValue(folder)
  // Scrivendo la cartella a mano il nome la segue
  await page.fill('#p-disk', `${chosen.slice(0, chosen.length - folder.length)}Portale clienti`)
  await expect(page.locator('#p-name')).toHaveValue('Portale clienti')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name: 'Portale clienti' })).toBeVisible()
  // Nessuna matita: il nome non si modifica dalla pagina del progetto
  await expect(page.locator('[data-edit-project]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Modifica il nome/ })).toHaveCount(0)
  // Workspace locale: nella pagina Membri non c'è «Gestione permessi» (c'è un solo utente)
  await page.getByTitle('Membri del workspace', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Gestione permessi' })).toHaveCount(0)
})

test('GitHub: collegamento con token, progetti creati dai repository e stack sincronizzato', async ({ page }) => {
  // API di GitHub simulata
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
  const repo = {
    name: 'demo-app',
    full_name: 'tester/demo-app',
    owner: { login: 'tester' },
    description: 'App di prova',
    html_url: 'https://github.com/tester/demo-app',
    default_branch: 'main',
    private: false,
    archived: false,
    fork: false,
    language: 'TypeScript',
    pushed_at: '2026-10-01T10:00:00Z',
  }
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const url = new URL(req.url())
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (req.headers()['authorization'] !== 'Bearer token-di-prova') return json({ message: 'Bad credentials' }, 401)
    if (url.pathname === '/user') return json({ login: 'tester', name: 'Tester' })
    if (url.pathname === '/user/repos') return json([repo])
    if (url.pathname === '/repos/tester/demo-app') return json(repo)
    if (url.pathname === '/repos/tester/demo-app/languages') return json({ TypeScript: 9000, Vue: 3000 })
    if (url.pathname === '/repos/tester/demo-app/contents/') return json([{ name: 'package.json', type: 'file' }])
    if (url.pathname === '/repos/tester/demo-app/contents/package.json')
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ dependencies: { vue: '^3.5.0' }, devDependencies: { typescript: '^5' } }) })
    return json({ message: 'Not Found' }, 404)
  })

  await createLocalWorkspace(page)
  await page.getByRole('link', { name: 'GitHub' }).click()
  await expect(page.getByRole('heading', { name: 'GitHub' })).toBeVisible()
  // Token sbagliato: errore chiaro
  await page.fill('#gh-token', 'token-sbagliato')
  await page.getByRole('button', { name: '2. Collega GitHub' }).click()
  await expect(page.getByText('Il token GitHub non è valido o è scaduto')).toBeVisible()
  await page.fill('#gh-token', 'token-di-prova')
  await page.getByRole('button', { name: '2. Collega GitHub' }).click()
  await expect(page.getByText('GitHub collegato come tester')).toBeVisible()

  // Repository → progetto collegato, con lo stack ricavato dai file
  await page.getByRole('main').locator('ul input[type=checkbox]').last().check()
  await page.getByRole('button', { name: 'Crea o collega 1 progetto' }).click()
  await expect(page.getByText('1 progetto creato o collegato da GitHub')).toBeVisible()
  await expect(page.getByText('collegato a «demo-app»')).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'demo-app' }).click()
  await expect(page.getByRole('heading', { name: 'demo-app' })).toBeVisible()
  await expect(page.locator('[data-github-link]')).toContainText('tester/demo-app')
  await expect(page.getByText('Vue 3', { exact: true })).toBeVisible()
  await expect(page.getByText('git clone https://github.com/tester/demo-app.git .')).toBeVisible()
})

test('nuovo progetto da cartella: importa un progetto esistente, rifiuta cartelle non vuote, di progetti o già usate', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic('/esterni/gestionale/package.json', JSON.stringify({ dependencies: { vue: '^3.5.0' }, devDependencies: { typescript: '^5' } }))
    await fs.writeTextAtomic('/esterni/script-py/analisi.py', 'print(1)')
    await fs.writeTextAtomic('/esterni/documenti/lettera.docx', 'x')
    await fs.writeTextAtomic('/esterni/vuota/desktop.ini', '')
  })
  const open = () => page.getByRole('button', { name: 'Progetto' }).first().click()
  const kind = page.locator('[data-folder-kind]')

  // Prima la cartella, poi il nome (preso dalla cartella)
  await open()
  const fields = await dialog(page).locator('input.field').evaluateAll((els) => els.map((e) => e.id))
  expect(fields.slice(0, 2)).toEqual(['p-disk', 'p-name'])

  // Cartella con file che non sono un progetto: errore, per partire da zero dev'essere vuota
  await page.fill('#p-disk', '/esterni/documenti')
  await expect(kind).toHaveAttribute('data-kind', 'other')
  await expect(kind).toContainText('la cartella deve essere vuota')
  await expect(page.getByRole('button', { name: 'Crea progetto' })).toBeDisabled()

  // Progetto esistente (anche solo sorgenti Python): riconosciuto e importato così com'è
  await page.fill('#p-disk', '/esterni/script-py')
  await expect(kind).toHaveAttribute('data-kind', 'project')
  await expect(kind).toContainText('analisi.py')
  await page.fill('#p-disk', '/esterni/gestionale')
  await expect(kind).toContainText('Progetto esistente riconosciuto (package.json)')
  await expect(page.locator('#p-name')).toHaveValue('gestionale')
  await page.getByRole('button', { name: 'Importa progetto' }).click()
  await expect(page.getByRole('heading', { name: 'gestionale' })).toBeVisible()
  await expect(page.getByText('Progetto importato: stack ricavato dai file della cartella')).toBeVisible()
  await expect(page.getByText('Vue 3', { exact: true })).toBeVisible()
  // La cartella non viene toccata: niente README aggiunto
  const touched = await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ exists(p: string): Promise<boolean> }> }).__pgmFs()
    return fs.exists('/esterni/gestionale/README.md')
  })
  expect(touched).toBe(false)

  // Stessa cartella una seconda volta: non si può creare un doppione
  await open()
  await page.fill('#p-disk', '/esterni/gestionale/')
  await expect(kind).toHaveAttribute('data-kind', 'error')
  await expect(kind).toContainText('Esiste già un progetto con questa cartella: «gestionale»')
  await expect(page.getByRole('button', { name: /Crea progetto|Importa progetto/ })).toBeDisabled()

  // Cartella vuota (solo file di sistema): progetto da zero, con i file iniziali
  await page.fill('#p-disk', '/esterni/vuota')
  await expect(kind).toHaveAttribute('data-kind', 'empty')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name: 'vuota' })).toBeVisible()
  await expect(page.getByText(/Cartella del progetto creata/)).toBeVisible()

  // Cartella che contiene più progetti: è una cartella di progetti, non di un progetto
  await open()
  await page.fill('#p-disk', '/esterni')
  await expect(kind).toHaveAttribute('data-kind', 'projects')
  await expect(kind).toContainText('contiene più progetti')
})

test('stack: «Rileva dai file del progetto» ricava lo stack anche dalle sottocartelle', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Gestionale')
  await openSection(page, 'Stack')
  const dir = (await page.locator('code', { hasText: /Gestionale$/ }).textContent())!.trim()
  // Il codice arriva dopo (es. copiato sulla cartella di rete): file di progetto in sottocartelle
  await page.evaluate(async (d) => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic(`${d}/frontend/package.json`, JSON.stringify({ dependencies: { vue: '^3.5.0' }, devDependencies: { typescript: '^5' } }))
    await fs.writeTextAtomic(`${d}/src/Api/Api.csproj`, '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>')
  }, dir)
  await expect(page.locator('[data-detect-hint]')).toBeVisible()
  // Un solo pulsante alla volta: il riquadro tratteggiato finché lo stack è vuoto…
  await expect(page.getByRole('button', { name: 'Rileva dai file del progetto' })).toHaveCount(1)
  await expect(page.locator('[data-detect-stack]')).toHaveCount(0)
  await page.locator('[data-detect-hint]').getByRole('button', { name: 'Rileva dai file del progetto' }).click()
  await expect(page.getByText(/Dai file del progetto:/)).toBeVisible()
  await expect(page.getByText('Vue 3', { exact: true })).toBeVisible()
  await expect(page.getByText('ASP.NET Core', { exact: true })).toBeVisible()
  await expect(page.getByText('Prerequisito: Node.js')).toBeVisible()
  await expect(page.getByText('Prerequisito: .NET SDK')).toBeVisible()
  await expect(page.locator('[data-detect-hint]')).toHaveCount(0)
  // …poi il pulsante in alto, accanto agli altri
  await expect(page.getByRole('button', { name: 'Rileva dai file del progetto' })).toHaveCount(1)
  // Seconda volta: niente di nuovo
  await page.locator('[data-detect-stack]').click()
  await expect(page.getByText(/Nessun dato nuovo dai file del progetto/)).toBeVisible()
})

test('configurazione del PC: banner rosso con «Visualizza», notifica locale e gestione delle notifiche', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Team')
  await pickWorkspaceFolders(page)
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'segreto1')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
  await createProject(page, 'Portale')

  // Stack con Node.js come prerequisito; su questo PC manca
  await fakeChecks(page, { 'node -v': { code: 9009, stderr: "'node' is not recognized as an internal or external command" } })
  await openSection(page, 'Stack')
  await expect(page.locator('[data-readiness-banner]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Aggiungi stack tecnologico' }).click()
  await page.getByPlaceholder('Es. TypeScript, C#, Rust').fill('TypeScript')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.locator('[data-prereq="Node.js"]')).toHaveAttribute('data-status', 'missing')

  // Banner rosso con «Visualizza»: elenca solo chi ha la configurazione incompleta
  const banner = page.locator('[data-readiness-banner]')
  await expect(banner).toContainText('1 utente ha una configurazione incompleta per questo progetto')
  await banner.getByRole('button', { name: 'Visualizza' }).click()
  await expect(dialog(page).locator('[data-readiness-list] > li')).toHaveCount(1)
  await expect(dialog(page)).toContainText('anteprima')
  await expect(dialog(page)).toContainText('Node.js — non installato')
  await dialog(page).getByRole('button', { name: 'Chiudi', exact: true }).last().click()

  // Notifica locale: nuova finché non la si vede, poi non più
  const bell = page.getByRole('button', { name: 'Notifiche' })
  await expect(bell.locator('[data-unread]')).toHaveText('1')
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Notifiche' })
  const note = panel.locator('[data-notification="setup_incomplete"]')
  await expect(note).toContainText('Configurazione incompleta su questo PC: Node.js non installato')
  await expect(note).toHaveAttribute('data-unread', 'true')
  await page.keyboard.press('Escape')
  await expect(bell.locator('[data-unread]')).toHaveCount(0) // vista = letta
  // Riverificando con la stessa mancanza non ricompare come nuova
  await page.getByRole('button', { name: 'Ricontrolla', exact: true }).click()
  await expect(page.locator('[data-prereq="Node.js"]')).toHaveAttribute('data-status', 'missing')
  await expect(bell.locator('[data-unread]')).toHaveCount(0)
  // Elimina la singola notifica
  await bell.click()
  await note.hover()
  await note.getByRole('button', { name: 'Elimina notifica' }).click()
  await expect(panel).toContainText('Nessuna notifica')
  await page.keyboard.press('Escape')

  // Node installato: il banner sparisce; manca di nuovo: nuova notifica, poi «Segna tutte come lette» ed «Elimina tutte»
  await fakeChecks(page, { 'node -v': { code: 0, stdout: 'v20.11.0' } })
  await page.getByRole('button', { name: 'Ricontrolla', exact: true }).click()
  await expect(page.locator('[data-prereq="Node.js"]')).toHaveAttribute('data-status', 'ok')
  await expect(banner).toHaveCount(0)
  await fakeChecks(page, { 'node -v': { code: 9009, stderr: "'node' is not recognized as an internal or external command" } })
  await page.getByRole('button', { name: 'Ricontrolla', exact: true }).click()
  await expect(bell.locator('[data-unread]')).toHaveText('1')
  await bell.click()
  await panel.getByRole('button', { name: 'Segna tutte come lette' }).click()
  await expect(bell.locator('[data-unread]')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Elimina tutte' }).click()
  await expect(panel).toContainText('Nessuna notifica')
  await page.keyboard.press('Escape')
})

test('copie di sicurezza: crea ora, stato nel menu, ripristino di tutto', async ({ page }) => {
  await createLocalWorkspace(page, 'Copie')
  await createProject(page, 'Alfa')
  await addItem(page, 'Prima della copia')

  await page.getByTitle('Impostazioni', { exact: true }).click()
  const settings = page.locator('[data-backup-settings]')
  await expect(settings).toContainText('non i file dei progetti')
  await settings.getByRole('button', { name: 'Crea copia ora' }).click()
  await expect(settings.locator('[data-backup-status]')).toContainText('Ultima copia:')
  await page.keyboard.press('Escape')

  // Stato nel menu del workspace (amministratore)
  await page.getByRole('button', { name: /^Copie/ }).first().click()
  await expect(page.getByRole('menuitem', { name: /Ultima copia dei dati/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // Dopo la copia: un altro task; il ripristino lo toglie e crea prima una copia dello stato attuale
  await addItem(page, 'Dopo la copia')
  await page.getByTitle('Impostazioni', { exact: true }).click()
  await settings.getByRole('button', { name: 'Ripristina…' }).click()
  const restore = page.getByRole('dialog', { name: 'Ripristina da una copia' })
  await restore.locator('[data-backup-list] button').first().click()
  await expect(restore.locator('[data-backup-summary]')).toHaveText('1 progetto, 1 task')
  await restore.getByRole('button', { name: 'Ripristina tutto' }).click()
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Ripristinare tutto il workspace?' }))).toContainText('non viene toccata')
  await page.getByRole('button', { name: 'Ripristina tutto' }).last().click()
  await expect(page.getByText('Ripristino completato')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Prima della copia', { exact: true })).toBeVisible()
  await expect(page.getByText('Dopo la copia', { exact: true })).toHaveCount(0)

  // La copia "prima del ripristino" c'è
  await page.getByTitle('Impostazioni', { exact: true }).click()
  await settings.getByRole('button', { name: 'Ripristina…' }).click()
  await expect(restore.locator('[data-backup-list]')).toContainText('prima di un ripristino')
})

test('commit git → task: codice TODO-n con frase da copiare, chiusura automatica dal commit, solo con .git', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic('/esterni/conrepo/package.json', JSON.stringify({ dependencies: { vue: '^3.5.0' } }))
    await fs.writeTextAtomic('/esterni/conrepo/.git/HEAD', 'ref: refs/heads/main')
    await fs.writeTextAtomic('/esterni/senzarepo/package.json', JSON.stringify({ dependencies: { vue: '^3.5.0' } }))
  })
  const setCommits = (repo: string, commits: { hash: string; author: string; message: string }[]) =>
    page.evaluate(
      ([r, c]) => {
        const w = window as unknown as { __pgmGit?: Record<string, unknown[]> }
        w.__pgmGit = { ...(w.__pgmGit ?? {}), [r as string]: (c as { hash: string }[]).map((x) => ({ date: '2026-10-15T10:00:00+02:00', ...x })) }
      },
      [repo, commits] as const,
    )
  const importFolder = async (path: string, name: string) => {
    await page.getByRole('button', { name: 'Progetto' }).first().click()
    await page.fill('#p-disk', path)
    await expect(page.locator('[data-folder-kind]')).toHaveAttribute('data-kind', 'project')
    await page.getByRole('button', { name: 'Importa progetto' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await openSection(page, 'Todo') // un progetto importato si apre sullo Stack
  }

  // Progetto senza .git: nessuna traccia di commit
  await setCommits('/esterni/senzarepo', [])
  await importFolder('/esterni/senzarepo', 'senzarepo')
  await addItem(page, 'Task senza repo')
  await rows(page).first().getByText('Task senza repo').click()
  await expect(page.locator('[data-git-hint]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await openSection(page, 'Stack')
  await expect(page.locator('[data-git-autoclose]')).toHaveCount(0)

  // Progetto con .git: codice e frase da copiare nel dettaglio del task
  await setCommits('/esterni/conrepo', [{ hash: '0ld00001', author: 'Mario', message: 'commit iniziale' }])
  await importFolder('/esterni/conrepo', 'conrepo')
  await addItem(page, 'Export XBRL')
  await addItem(page, 'Login')
  await rows(page).filter({ hasText: 'Export XBRL' }).getByText('Export XBRL').click()
  const hint = page.locator('[data-git-hint]')
  await expect(hint).toContainText('TODO-1')
  await expect(hint.locator('[data-close-phrase]')).toHaveText('chiude TODO-1')
  await expect(hint).toContainText('Scrivi nel messaggio del commit')
  await page.keyboard.press('Escape')
  // Nello Stack l'admin vede l'interruttore, attivo
  await openSection(page, 'Stack')
  await expect(page.locator('[data-git-autoclose] input[type=checkbox]')).toBeChecked()

  // Arriva un commit con "chiude TODO-1": tornando sulla finestra il task si completa da solo
  await setCommits('/esterni/conrepo', [
    { hash: 'a1b2c3d4e5', author: 'Anna', message: 'Export XBRL con validazione\n\nchiude TODO-1' },
    { hash: '0ld00001', author: 'Mario', message: 'commit iniziale' },
  ])
  await openSection(page, 'Todo')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('TODO-1 completato dal commit a1b2c3d di Anna')).toBeVisible()
  await expect(rows(page)).toHaveCount(1) // resta "Login"
  await page.getByRole('button', { name: /^Completati/ }).click()
  await rows(page).first().getByText('Export XBRL').click()
  await expect(page.locator('[data-closed-by-commit]')).toContainText('Completato dal commit a1b2c3d di Anna')
  await expect(page.locator('[data-closed-by-commit]')).toContainText('Export XBRL con validazione')
})

test('Gantt: solo task Confermati con scadenza, per etichetta o priorità; scadenza solo se Confermato', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Pianificazione')
  // Etichette
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: 'Etichette' }).click()
  const labels = page.getByRole('dialog').filter({ hasText: 'Badge da assegnare' })
  for (const l of ['Bug', 'UX']) {
    await labels.getByPlaceholder('Nuova etichetta').fill(l)
    await labels.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  }
  await labels.getByRole('button', { name: 'Chiudi', exact: true }).last().click()

  const addTask = async (title: string, opts: { status?: string; due?: string; label?: string; priority?: string }) => {
    await newItemButton(page).click()
    await page.fill('#i-title', title)
    // Scadenza bloccata finché lo stato non è Confermato
    await expect(page.locator('#i-due')).toBeDisabled()
    await expect(page.locator('[data-due-locked]')).toBeVisible()
    if (opts.priority) await page.locator('#i-priority').selectOption(opts.priority)
    if (opts.status) await page.locator('#i-status').selectOption(opts.status)
    if (opts.due) {
      await expect(page.locator('#i-due')).toBeEnabled()
      await page.fill('#i-due', opts.due)
    }
    if (opts.label) await page.locator('#i-label').selectOption({ label: opts.label })
    await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
    await expect(dialog(page)).toHaveCount(0)
  }
  const d = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  await addTask('Login', { status: 'confermato', due: d(5), label: 'Bug', priority: 'immediata' })
  await addTask('Tema scuro', { status: 'confermato', due: d(9), label: 'UX', priority: 'bassa' })
  await addTask('Report', { status: 'confermato', due: d(3) })
  await addTask('Da valutare', { label: 'Bug' }) // non confermato: fuori dal Gantt

  // Tornando a "Da valutare" la scadenza si toglie
  await newItemButton(page).click()
  await page.locator('#i-status').selectOption('confermato')
  await page.fill('#i-due', d(4))
  await page.locator('#i-status').selectOption('da_definire')
  await expect(page.locator('#i-due')).toHaveValue('')
  await expect(page.locator('#i-due')).toBeDisabled()
  await page.keyboard.press('Escape')

  await openSection(page, 'Gantt')
  await expect(page.locator('[data-gantt-count]')).toHaveText('3 task')
  await expect(page.locator('[data-gantt-group]')).toHaveText([/^Bug/, /^UX/, /^Senza etichetta/])
  await expect(page.locator('[data-gantt-row="Da valutare"]')).toHaveCount(0)
  await expect(page.locator('[data-gantt-today]')).toBeVisible()
  // Per priorità
  await page.getByRole('radio', { name: 'Priorità' }).click()
  await expect(page.locator('[data-gantt-group]')).toHaveText([/^Immediata/, /^Media/, /^Bassa/])
  // Un clic apre il task nella lista, con il dettaglio
  await page.locator('[data-gantt-bar="Login"]').click()
  await expect(page.locator('#d-status')).toHaveValue('confermato')
})
