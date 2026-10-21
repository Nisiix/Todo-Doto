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
