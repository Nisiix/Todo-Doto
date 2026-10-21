import { expect, test, type Page } from '@playwright/test'

/**
 * Ondata 3 del piano delle funzionalità: automazioni, confronto fra due date,
 * «Chiedi al progetto». Stesse condizioni di app.spec.ts: build Vite nel
 * browser, filesystem in memoria.
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

const quick = (page: Page) => page.locator('[data-quick-input]')
async function addTasks(page: Page, titles: string[]) {
  for (const t of titles) {
    await quick(page).fill(t)
    await quick(page).press('Enter')
    await expect(quick(page)).toHaveValue('')
  }
}
const row = (page: Page, title: string) => rows(page).filter({ hasText: title })
async function openTask(page: Page, title: string) {
  await row(page, title).click()
  await expect(page.locator('[data-detail-panel], aside:has(#d-priority)')).toHaveCount(1)
  await expect(page.locator('#d-priority')).toHaveCount(1)
}
async function workspaceMenu(page: Page, item: string) {
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('automazioni: spente all’inizio; urgente senza responsabile e scadenza chiesta alla conferma', async ({ page }) => {
  await page.clock.install()
  await createLocalWorkspace(page)
  await createProject(page, 'Assistenza')
  await addTasks(page, ['Server giù !immediata', 'Nuovo modulo'])

  // Spente: nessuna domanda alla conferma
  await openTask(page, 'Nuovo modulo')
  await page.locator('#d-status').selectOption('confermato')
  await page.locator('[data-detail-save]').getByRole('button', { name: 'Salva' }).click()
  await expect(page.locator('[data-due-ask]')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // L'amministratore le accende
  await workspaceMenu(page, 'Automazioni')
  const rules = page.locator('[data-automations]')
  for (const r of ['urgentUnassigned', 'unansweredQuestion', 'confirmedNoDue']) await rules.locator(`[data-rule="${r}"] input[type=checkbox]`).check()
  await expect(rules.locator('[data-rule="unansweredQuestion"] [data-rule-days]')).toHaveValue('5')
  await rules.locator('[data-automations-save]').click()
  await expect(dialog(page)).toHaveCount(0)

  // Confermato senza scadenza: l'app la chiede
  await addTasks(page, ['Backup notturno'])
  await openTask(page, 'Backup notturno')
  await page.locator('#d-status').selectOption('confermato')
  await page.locator('[data-detail-save]').getByRole('button', { name: 'Salva' }).click()
  const ask = page.locator('[data-due-ask]')
  await expect(ask).toBeVisible()
  await expect(dialog(page)).toContainText('Backup notturno')
  await ask.getByRole('button', { name: 'Fine mese' }).click()
  await ask.locator('[data-due-ask-save]').click()
  await expect(ask).toHaveCount(0)
  await expect(page.locator('#d-due')).not.toHaveValue('')
  await page.keyboard.press('Escape')

  // Il giorno dopo il task urgente è ancora senza responsabile: notifica all'amministratore
  await expect(page.locator('[data-notification="urgent_unassigned"]')).toHaveCount(0)
  await page.clock.fastForward('25:00:00')
  await expect(page.locator('[data-unread]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Notifiche' }).click()
  const n = page.locator('[data-notification="urgent_unassigned"]')
  await expect(n).toHaveCount(1)
  await expect(n).toContainText('task urgente ancora senza responsabile da 1 giorno')
  await expect(n).toContainText('Server giù')
})

test('cosa è cambiato: dalla copia di sicurezza ad adesso, per tipo, con scadenze «da → a»', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Negozio')
  await addTasks(page, ['Carrello', 'Pagamenti entro il 10/11/2030', 'Vecchia pagina'])

  // Senza copie non c'è niente da confrontare
  await workspaceMenu(page, 'Cosa è cambiato')
  await expect(page.locator('[data-changes-empty]')).toBeVisible()
  await page.keyboard.press('Escape')

  await workspaceMenu(page, 'Impostazioni')
  await page.locator('[data-settings-tab="backup"]').click()
  await page.locator('[data-backup-settings]').getByRole('button', { name: 'Crea copia ora' }).click()
  await expect(page.locator('[data-backup-settings] [data-backup-status]')).toContainText('Ultima copia:')
  await page.keyboard.press('Escape')

  // Dopo la copia: un completato, una scadenza spostata, uno nel cestino, uno nuovo
  await row(page, 'Carrello').getByTitle('Segna come completato (C)').click()
  await openTask(page, 'Pagamenti')
  await page.locator('#d-due').fill('2030-11-24')
  await page.locator('[data-detail-save]').getByRole('button', { name: 'Salva' }).click()
  await page.keyboard.press('Escape')
  await row(page, 'Vecchia pagina').click()
  await expect(page.locator('#d-priority')).toHaveCount(1)
  await page.keyboard.press('Delete')
  await expect(row(page, 'Vecchia pagina')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await addTasks(page, ['Recensioni'])

  await workspaceMenu(page, 'Cosa è cambiato')
  const changes = page.locator('[data-changes]')
  await expect(changes.locator('[data-changes-from] option:checked')).toContainText('copia manuale')
  await expect(changes.locator('[data-changes-to] option:checked')).toHaveText('adesso')
  const project = changes.locator('[data-changes-project="Negozio"]')
  await expect(project.locator('[data-change="added"]')).toContainText('Recensioni')
  await expect(project.locator('[data-change="completed"]')).toContainText('Carrello')
  await expect(project.locator('[data-change="trashed"]')).toContainText('Vecchia pagina')
  await expect(project.locator('[data-change="due"]')).toContainText('10 nov 2030')
  await expect(project.locator('[data-change="due"]')).toContainText('24 nov 2030')

  // Solo le scadenze spostate
  await changes.locator('[data-changes-kind="due"]').click()
  await expect(project.locator('[data-change]')).toHaveCount(1)

  // Un clic apre il task
  await changes.locator('[data-changes-kind="due"]').click()
  await project.locator('[data-change="added"] button').click()
  await expect(changes).toHaveCount(0)
  await expect(page.locator('#d-title, textarea[aria-label="Titolo"]').first()).toHaveValue('Recensioni')
})
