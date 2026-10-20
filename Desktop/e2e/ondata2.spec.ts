import { expect, test, type Page } from '@playwright/test'

/**
 * Ondata 2 del piano delle funzionalità: dipendenze, tappe, carico e assenze,
 * PC pronti e salute, rapporto di stato, calendari, modelli, pulizia guidata.
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
async function addTasks(page: Page, titles: string[]) {
  for (const t of titles) {
    await quick(page).fill(t)
    await quick(page).press('Enter')
    await expect(quick(page)).toHaveValue('')
  }
}
const row = (page: Page, title: string) => rows(page).filter({ hasText: title })
/** Apre il task e aspetta che resti un solo pannello di dettaglio (l'animazione ne mostra due per un attimo). */
async function openTask(page: Page, title: string) {
  await row(page, title).click()
  await expect(page.locator('[data-detail-panel], aside:has(#d-priority)')).toHaveCount(1)
  await expect(page.locator('#d-priority')).toHaveCount(1)
}

test('dipendenze: lucchetto, conflitto di scadenza, niente cicli, frecce nel Gantt, sblocco al completamento', async ({ page }) => {
  await createLocalWorkspace(page)
  await createProject(page, 'Rilascio')
  await addTasks(page, ['Schema del database entro il 20/11/2030', 'API ordini entro il 10/11/2030', 'Pagina ordini entro il 30/11/2030'])

  // API ordini va fatta dopo lo schema (che però scade dopo: conflitto)
  await openTask(page, 'API ordini')
  const deps = page.locator('[data-dependencies]')
  await deps.locator('[data-add-blocker]').selectOption({ label: 'TODO-1 Schema del database' })
  await expect(deps.locator('[data-blockers]')).toContainText('Schema del database')
  await expect(deps.locator('[data-blocked]')).toContainText('Bloccato da un task ancora da fare')
  await expect(deps.locator('[data-due-conflict]')).toContainText('TODO-1 scade il')
  await expect(row(page, 'API ordini').locator('[data-row-blocked]')).toBeVisible()
  await page.keyboard.press('Escape')

  // Pagina ordini va fatta dopo le API
  await openTask(page, 'Pagina ordini')
  await deps.locator('[data-add-blocker]').selectOption({ label: 'TODO-2 API ordini' })
  await page.keyboard.press('Escape')

  // Lo schema non può aspettare chi già lo aspetta: nessun candidato che crei un ciclo
  await openTask(page, 'Schema del database')
  const options = await deps.locator('[data-add-blocker] option').allTextContents()
  expect(options.join('|')).not.toContain('API ordini')
  expect(options.join('|')).not.toContain('Pagina ordini')
  await expect(deps.locator('[data-waiting]')).toContainText('API ordini')
  await page.keyboard.press('Escape')

  // Gantt: due frecce, una in conflitto, legenda
  await page.locator('aside').first().getByRole('link', { name: /^Gantt( \d+)?$/ }).click()
  await expect(page.locator('[data-gantt-links] [data-gantt-link]')).toHaveCount(2)
  await expect(page.locator('[data-gantt-links] [data-conflict]')).toHaveCount(1)
  await expect(page.locator('[data-gantt-legend]')).toContainText('catena critica')

  // Completando lo schema, le API si sbloccano
  await page.locator('aside').first().getByRole('link', { name: /^Todo( \d+)?$/ }).click()
  await row(page, 'Schema del database').getByTitle('Segna come completato (C)').click()
  await expect(row(page, 'API ordini').locator('[data-row-blocked]')).toHaveCount(0)
  await expect(row(page, 'Pagina ordini').locator('[data-row-blocked]')).toBeVisible()
})

test('tappe: avanzamento, task con ~, filtro, Gantt, note di versione e CHANGELOG.md', async ({ page }) => {
  await createLocalWorkspace(page)
  await addLabels(page, ['Novità', 'Correzioni'])
  // Progetto importato da una cartella: le note si possono aggiungere al suo CHANGELOG.md
  await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
    await fs.writeTextAtomic('/esterni/negozio/package.json', JSON.stringify({ dependencies: { vue: '^3.5.0' } }))
    await fs.writeTextAtomic('/esterni/negozio/CHANGELOG.md', '# Novità del negozio\n\n## v1.2 — ieri\n\n- Vecchio\n')
  })
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-disk', '/esterni/negozio')
  await expect(page.locator('[data-folder-kind]')).toHaveAttribute('data-kind', 'project')
  await page.getByRole('button', { name: 'Importa progetto' }).click()
  await expect(page.getByRole('heading', { name: 'negozio' })).toBeVisible()
  await page.locator('aside').first().getByRole('link', { name: /^Todo( \d+)?$/ }).click()

  await page.locator('[data-milestones-open]').click()
  await page.locator('[data-milestone-name]').fill('v1.3')
  await page.locator('[data-milestone-due]').fill('2030-12-01')
  await page.locator('[data-milestone-save]').click()
  await expect(page.locator('[data-milestone="v1.3"]')).toContainText('Nessun task legato')
  await page.keyboard.press('Escape')

  await addTasks(page, ['Carrello ~v1.3 #novità entro il 20/11/2030', 'Crash al pagamento ~v1 #correzioni', 'Fuori tappa'])
  await expect(row(page, 'Carrello').locator('[data-row-milestone]')).toContainText('v1.3')
  await row(page, 'Crash al pagamento').getByTitle('Segna come completato (C)').click()

  // Avanzamento e «Mostra i task»
  await page.locator('[data-milestones-open]').click()
  await expect(page.locator('[data-milestone="v1.3"] [data-milestone-progress]')).toContainText('1 di 2 completati')
  await page.locator('[data-milestone="v1.3"] [data-milestone-tasks]').click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Carrello')
  await page.getByRole('button', { name: /^Completati/ }).click()
  await expect(rows(page).first()).toContainText('Crash al pagamento')
  await page.getByRole('button', { name: /^Da fare/ }).click()

  // Gantt: linea della tappa
  await page.locator('aside').first().getByRole('link', { name: /^Gantt( \d+)?$/ }).click()
  await expect(page.locator('[data-gantt-milestone="v1.3"]')).toBeVisible()
  await page.locator('aside').first().getByRole('link', { name: /^Todo( \d+)?$/ }).click()

  // Raggiunta: note di versione per etichetta, da copiare o aggiungere al CHANGELOG.md
  await page.locator('[data-milestones-open]').click()
  await page.locator('[data-milestone="v1.3"] [data-milestone-close="close"]').click()
  await expect(page.locator('[data-milestone="v1.3"]')).toContainText('raggiunta il')
  await page.locator('[data-milestone="v1.3"] [data-milestone-notes]').click()
  const text = page.locator('[data-release-text]')
  await expect(text).toHaveValue(/## v1\.3 — /)
  await expect(text).toHaveValue(/- Crash al pagamento — TODO-2/)
  await expect(text).not.toHaveValue(/Carrello/)
  await page.locator('[data-release-changelog]').click()
  const changelog = await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ readText(p: string): Promise<string> }> }).__pgmFs()
    return fs.readText('/esterni/negozio/CHANGELOG.md')
  })
  expect(changelog.indexOf('## v1.3')).toBeGreaterThan(changelog.indexOf('# Novità del negozio'))
  expect(changelog.indexOf('## v1.3')).toBeLessThan(changelog.indexOf('## v1.2'))
})
