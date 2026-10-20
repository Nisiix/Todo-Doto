import { expect, test, type Page } from '@playwright/test'

/**
 * Ondata 1 del piano delle funzionalità: inserimento rapido, decisioni,
 * attenzioni e tempi, vista Oggi, attività git, archivio, palette dei comandi.
 * Stesse condizioni di app.spec.ts: build Vite nel browser, filesystem in memoria.
 */

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(() => {
    Object.assign(window, {
      __pgmSeedFiles: { '/appdata/config.json': JSON.stringify({ ai: { bannerDismissed: true, autoDetectDone: true } }) },
      __pgmNetworkDrives: ['/rete'],
    })
  })
})
test.afterEach(() => expect(pageErrors).toEqual([]))

const dialog = (page: Page) => page.getByRole('dialog')
const rows = (page: Page) => page.locator('[role=button][tabindex="0"]')

async function createLocalWorkspace(page: Page, name = 'Roadmap Sviluppo') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', name)
  await page.getByRole('button', { name: 'Scegli la cartella dei progetti' }).click()
  await page.getByRole('button', { name: 'Scegli la cartella Dati Todo Doto' }).click()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', name)
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

async function addLabels(page: Page, names: string[]) {
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: 'Etichette' }).click()
  const labels = page.getByRole('dialog').filter({ hasText: 'Badge da assegnare' })
  for (const l of names) {
    await labels.getByPlaceholder('Nuova etichetta').fill(l)
    await labels.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  }
  await labels.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
}

const quick = (page: Page) => page.locator('[data-quick-input]')

test('inserimento rapido: comandi riconosciuti prima di Invio, task creato con i campi; anche nel dialog', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Rapido')
  await addLabels(page, ['Bug'])

  await quick(page).fill('Esportazione CSV !alta #bug entro il 15/11/2030')
  const chips = page.locator('[data-quick-add] [data-quick-chips]')
  await expect(chips.locator('[data-quick-chip="priority"]')).toContainText('Alta')
  await expect(chips.locator('[data-quick-chip="label"]')).toContainText('Bug')
  await expect(chips.locator('[data-quick-chip="due"]')).toContainText('15 nov')
  await expect(chips.locator('[data-quick-chip="due"]')).toContainText('Confermato')
  await quick(page).press('Enter')
  await expect(quick(page)).toHaveValue('')
  const row = rows(page).filter({ hasText: 'Esportazione CSV' })
  await expect(row).toHaveCount(1)
  await expect(row.getByTitle('Etichetta: Bug').first()).toBeVisible()
  await row.click()
  await expect(page.locator('#d-priority')).toHaveValue('alta')
  await expect(page.locator('#d-status')).toHaveValue('confermato')
  await expect(page.locator('#d-due')).toHaveValue('2030-11-15')
  await page.keyboard.press('Escape')

  // La X lascia il comando nel titolo
  await quick(page).fill('Report per domani')
  await page.locator('[data-quick-add] [data-quick-chip="due"] button').click()
  await expect(page.locator('[data-quick-add] [data-quick-chip="due"]')).toHaveCount(0)
  await quick(page).press('Enter')
  await expect(rows(page).filter({ hasText: 'Report per domani' })).toHaveCount(1)

  // Nel dialog «Nuovo task» i comandi compilano i campi e spariscono dal titolo
  await page.getByRole('button', { name: 'Nuovo task' }).click()
  await page.fill('#i-title', 'Pagina errori !immediata')
  await expect(dialog(page).locator('#i-priority')).toHaveValue('immediata')
  await dialog(page).getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(rows(page).filter({ hasText: 'Pagina errori' })).toHaveCount(1)
  await expect(page.getByText('Pagina errori !immediata')).toHaveCount(0)
})

test('decisioni: una risposta diventa la decisione con la motivazione, nel registro del progetto e copiabile', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Architettura')
  await quick(page).fill('Scegliere il database')
  await quick(page).press('Enter')
  await rows(page).filter({ hasText: 'Scegliere il database' }).click()

  const ask = page.getByPlaceholder('Fai una domanda')
  await ask.fill('PostgreSQL o MySQL?')
  await ask.press('Enter')
  await expect(page.getByText('PostgreSQL o MySQL?')).toBeVisible()
  await page.getByRole('button', { name: 'Rispondi' }).first().click()
  await page.getByPlaceholder('La tua risposta').fill('PostgreSQL, come il resto del cliente')
  await page.getByRole('button', { name: 'Rispondi', exact: true }).last().click()
  await expect(page.getByText('PostgreSQL, come il resto del cliente')).toBeVisible()

  // Nessuna decisione ancora: niente pulsante nell'intestazione
  await expect(page.locator('[data-decisions-open]')).toHaveCount(0)
  await page.locator('[data-decide]').first().click()
  await page.getByLabel('Perché? (facoltativo)').fill('Il cliente lo usa già')
  await page.locator('[data-decision-confirm]').click()
  const decided = page.locator('[data-decision]')
  await expect(decided).toContainText('Decisione')
  await expect(decided).toContainText('Il cliente lo usa già')
  // La domanda è risolta (ed etichettata «decisa»)
  await expect(page.getByText('decisa', { exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-decisions-open]')).toContainText('1')
  await page.locator('[data-decisions-open]').click()
  const list = page.locator('[data-decisions-list]')
  await expect(list).toContainText('PostgreSQL o MySQL?')
  await expect(list).toContainText('Il cliente lo usa già')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.locator('[data-decisions-copy]').click()
  const md = await page.evaluate(() => navigator.clipboard.readText())
  expect(md).toContain('## Decisioni del progetto · Architettura')
  expect(md).toContain('→ PostgreSQL, come il resto del cliente')
  // Dal registro si apre il task
  await list.getByRole('button', { name: /Scegliere il database/ }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('[data-decision]')).toBeVisible()
})

test('attenzioni e tempi: urgenze senza nessuno e confermati senza scadenza, con i tempi del progetto', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Salute')
  await quick(page).fill('Server giù !immediata')
  await quick(page).press('Enter')
  await quick(page).fill('Tutto tranquillo')
  await quick(page).press('Enter')
  await expect(page.locator('[data-insights-toggle]')).toContainText('1')
  await page.locator('[data-insights-toggle]').click()
  const panel = page.locator('[data-insights]')
  await expect(panel.locator('[data-signal="urgent_unassigned"]')).toContainText('Server giù')
  await expect(panel.locator('[data-signal="urgent_unassigned"]')).toContainText('non è assegnata a nessuno')
  await expect(panel.locator('[data-cycle-times]')).toContainText('Da creato a confermato')
  await expect(panel).toContainText('Servono almeno 3 task completati')
  await expect(panel.locator('[data-aging]')).toContainText('meno di 1 settimana')
  // Clic sull'attenzione: si apre il task
  await panel.locator('[data-signal="urgent_unassigned"]').click()
  await expect(page.locator('#d-priority')).toHaveValue('immediata')
})

test('oggi: ritardi, scadenze e urgenze di tutti i progetti; completare e rinviare senza aprire il progetto', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Sito')
  await quick(page).fill('Consegnare le bozze entro oggi')
  await quick(page).press('Enter')
  await quick(page).fill('Server giù !immediata')
  await quick(page).press('Enter')
  await quick(page).fill('Idea per dopo')
  await quick(page).press('Enter')
  await createProject(page, 'App')
  await quick(page).fill('Release entro domani')
  await quick(page).press('Enter')

  const link = page.locator('[data-today-link]')
  await expect(link).toContainText('1')
  await link.click()
  const view = page.locator('[data-today]')
  await expect(view.getByRole('heading', { name: 'Oggi', exact: true })).toBeVisible()
  await expect(view.locator('[data-today-section="today"]')).toContainText('Consegnare le bozze')
  await expect(view.locator('[data-today-section="urgent"]')).toContainText('Server giù')
  await expect(view.locator('[data-today-section="week"]')).toContainText('Release')
  await expect(view.locator('[data-today-section="week"]')).toContainText('App')
  await expect(view).not.toContainText('Idea per dopo')

  // Completare dalla vista
  await view.locator('[data-today-section="today"] [data-today-complete]').click()
  await expect(view.locator('[data-today-section="today"]')).toHaveCount(0)
  await expect(link).not.toContainText('1')

  // Rinviare: sparisce fino al giorno scelto, poi si riprende
  await view.locator('[data-today-section="urgent"] li').hover()
  await view.locator('[data-today-section="urgent"] [data-today-snooze]').click()
  await page.getByRole('menuitem', { name: /A domani/ }).click()
  await expect(view.locator('[data-today-section="urgent"]')).toHaveCount(0)
  await view.locator('[data-today-snoozed] summary').click()
  await expect(view.locator('[data-today-snoozed]')).toContainText('Server giù')
  await view.locator('[data-today-snoozed]').getByRole('button', { name: 'Riprendi ora' }).click()
  await expect(view.locator('[data-today-section="urgent"]')).toContainText('Server giù')

  // Clic sul titolo: si apre il task nel suo progetto
  await view.locator('[data-today-section="week"]').getByText('Release').click()
  await expect(page.getByRole('heading', { name: 'App' })).toBeVisible()
  await expect(page.locator('#d-due')).not.toHaveValue('')
})

test('attività git: commit che citano il task, branch da copiare, «in lavorazione» dal codice', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic('/esterni/negozio/package.json', JSON.stringify({ dependencies: { vue: '^3.5.0' } }))
    await fs.writeTextAtomic('/esterni/negozio/.git/HEAD', 'ref: refs/heads/todo-2-pagina-di-accesso\n')
  })
  const recent = new Date(Date.now() - 86_400_000).toISOString()
  await page.evaluate((date) => {
    Object.assign(window, {
      __pgmGit: {
        '/esterni/negozio': [
          { hash: 'b2b2b2b2b2', author: 'Anna', date, message: 'TODO-1 prima bozza del carrello' },
          { hash: 'a1a1a1a1a1', author: 'Mario', date: '2026-01-10T10:00:00Z', message: 'commit iniziale' },
        ],
      },
    })
  }, recent)
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-disk', '/esterni/negozio')
  await expect(page.locator('[data-folder-kind]')).toHaveAttribute('data-kind', 'project')
  await page.getByRole('button', { name: 'Importa progetto' }).click()
  await expect(page.getByRole('heading', { name: 'negozio' })).toBeVisible()
  await page.locator('aside').first().getByRole('link', { name: /^Todo( \d+)?$/ }).click()

  await quick(page).fill('Carrello')
  await quick(page).press('Enter')
  await quick(page).fill('Pagina di accesso')
  await quick(page).press('Enter')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  // TODO-1 citato da un commit di ieri, TODO-2 col branch aperto su questo PC: entrambi «in lavorazione»
  await expect(rows(page).filter({ hasText: 'Carrello' }).locator('[data-git-active]')).toBeVisible()
  await expect(rows(page).filter({ hasText: 'Pagina di accesso' }).locator('[data-git-active]')).toBeVisible()

  await rows(page).filter({ hasText: 'Carrello' }).click()
  const act = page.locator('[data-git-activity]')
  await expect(act.locator('[data-task-commits]')).toContainText('prima bozza del carrello')
  await expect(act.locator('[data-task-commits]')).toContainText('Anna')
  await expect(act.locator('[data-branch-name]')).toHaveText('todo-1-carrello')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await act.locator('[data-copy-switch]').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('git switch -c todo-1-carrello')
  await page.keyboard.press('Escape')

  await rows(page).filter({ hasText: 'Pagina di accesso' }).click()
  await expect(act).toHaveCount(1)
  await expect(act.locator('[data-branch-here]')).toContainText('aperto su questo PC')
  await expect(act).toContainText('Nessun commit cita ancora TODO-2')
})
