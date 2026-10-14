import { expect, test, type Page } from '@playwright/test'

/**
 * Flusso completo dell'utente, dall'avvio alla gestione di un progetto.
 * Gira sulla build Vite nel browser (filesystem in memoria): verifica
 * l'interfaccia e la logica insieme, senza il backend Tauri.
 */

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

const newItemButton = (page: Page) => page.getByRole('button', { name: 'Nuovo elemento' })
const rows = (page: Page) => page.locator('[role=button][tabindex="0"]')
const dialog = (page: Page) => page.getByRole('dialog')

async function addItem(page: Page, title: string, priority = 'media', opts: { notes?: string; label?: string } = {}) {
  await newItemButton(page).click()
  await page.fill('#i-title', title)
  if (opts.notes) await page.fill('#i-notes', opts.notes)
  await dialog(page).locator('select[title^="Priorità"]').selectOption(priority)
  if (opts.label) await dialog(page).getByLabel('Etichetta').selectOption({ label: opts.label })
  await dialog(page).getByRole('button', { name: 'Aggiungi', exact: true }).click()
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
  // Recenti: ultimi modificati, il più recente in alto
  const recenti = aside.locator('section', { hasText: 'Recenti' })
  await expect(recenti.locator('li').first()).toContainText('Beta')

  // Sposta nel cestino dall'intestazione del progetto
  await page.getByRole('button', { name: 'Sposta nel cestino' }).click()
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
  await createProject(page, 'Bilancio Europeo Web')

  // Inserimento tramite dialog: titolo + descrizione su più righe
  await newItemButton(page).click()
  await page.fill('#i-title', 'Refactor mapping NHibernate')
  await page.fill('#i-notes', 'prima riga')
  await page.locator('#i-notes').press('Enter')
  await page.locator('#i-notes').type('seconda riga')
  await dialog(page).getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(rows(page).first()).toContainText('Refactor mapping NHibernate')
  await expect(rows(page).first()).not.toContainText('seconda riga')
  await addItem(page, 'Login SPID', 'immediata')
  await addItem(page, 'Export XBRL', 'alta')

  // Ordinati per priorità, con il nome dell'autore per intero
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(0)).toContainText('Login SPID')
  await expect(rows(page).nth(0)).toContainText('anteprima')

  // Filtri: per priorità, poi azzera
  await page.getByRole('group', { name: 'Filtri' }).getByRole('button', { name: 'Immediata' }).click()
  await expect(rows(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Azzera filtri' }).click()
  await expect(rows(page)).toHaveCount(3)

  // Ordine dei tab: Da fare, Completati, Allegati, Cestino
  const tabs = page.locator('nav button')
  await expect(tabs.nth(2)).toContainText('Allegati')
  await expect(tabs.nth(3)).toContainText('Cestino')

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
  await dialog(page).getByLabel('Etichetta').selectOption('__manage__')
  const labels = page.getByRole('dialog').filter({ hasText: 'Badge da assegnare' })
  await expect(labels).toBeVisible()
  await labels.getByPlaceholder('Nuova etichetta').fill('Bug')
  await labels.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(labels.locator('input[aria-label="Nome etichetta Bug"]')).toBeVisible()
  await labels.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
  await expect(labels).toBeHidden()
  await page.fill('#i-title', 'Crash all’avvio')
  await dialog(page).getByLabel('Etichetta').selectOption({ label: 'Bug' })
  await dialog(page).getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(rows(page).first().getByTitle('Etichetta: Bug').first()).toBeVisible()
  // Filtro per etichetta
  await page.getByRole('group', { name: 'Filtri' }).getByLabel('Etichetta').selectOption({ label: 'Bug' })
  await expect(rows(page)).toHaveCount(1)
})

test('allegati: cartelle, link, file e anteprima interna', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Progetto allegati')
  await page.getByRole('button', { name: /^Allegati/ }).click()
  await page.getByRole('button', { name: 'Cartella', exact: true }).click()
  await page.fill('input[placeholder="Es. Specifiche, Mockup, Contratti"]', 'Specifiche')
  await page.getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Specifiche' })).toBeVisible()

  await page.getByRole('button', { name: 'Allegato', exact: true }).click()
  await page.fill('#a-target', 'figma.com/file/abc')
  await page.fill('#a-name', 'Mockup')
  await page.selectOption('#a-folder', { label: 'Specifiche' })
  await page.getByRole('button', { name: 'Aggiungi' }).click()
  await expect(page.getByText('https://figma.com/file/abc')).toBeVisible()

  await page.getByRole('button', { name: 'Allegato', exact: true }).click()
  await page.getByRole('radio', { name: 'File' }).click()
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await expect(page.locator('#a-name')).toHaveValue('documento.pdf')
  await page.getByRole('button', { name: 'Aggiungi' }).click()
  await expect(page.getByText('documento.pdf', { exact: true })).toBeVisible()

  // Anteprima interna del link: riquadro incorporato + pulsante per il browser
  await page.getByRole('button', { name: 'Mockup' }).click()
  await expect(page.getByRole('dialog')).toContainText('Mockup')
  await expect(page.getByRole('dialog').locator('iframe')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Apri nel browser' })).toBeVisible()
  await page.getByRole('dialog').locator('button:has-text("Chiudi")').last().click()
})

test('ricerca e scorciatoie da tastiera', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Ricerca')
  await page.keyboard.press('n')
  await expect(page.locator('#i-title')).toBeFocused()
  await page.fill('#i-title', 'Prima cosa')
  await page.keyboard.press('Control+Enter')
  await expect(rows(page)).toHaveCount(1)
  await addItem(page, 'Seconda cosa')
  await page.keyboard.press('Control+k')
  await page.keyboard.type('seconda')
  await expect(page.getByText('Seconda cosa')).toBeVisible()
  await expect(page.getByText('Prima cosa')).toBeHidden()
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
