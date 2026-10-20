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

test('carico e assenze: disponibilità, stima con =h, griglia per settimana, scadenza durante le ferie', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T09:00:00') }) // mercoledì
  await createLocalWorkspace(page)
  await createProject(page, 'Portale')

  // Disponibilità: 10 ore a settimana, ferie dal 26 al 30 ottobre
  await page.evaluate(() => (location.hash = '#/w/members'))
  await page.locator('[data-availability-open]').first().click()
  await page.locator('#av-hours').fill('10')
  await page.locator('[data-absence-add]').click()
  await page.locator('[data-absence-from]').fill('2026-10-26')
  await page.locator('[data-absence-to]').fill('2026-10-30')
  await page.locator('[data-availability-save]').click()
  await expect(page.locator('[data-member-absence]')).toContainText('assente dal 26 ott al 30 ott')

  await page.locator('aside').first().getByText('Portale', { exact: true }).click()
  await addTasks(page, ['Analisi =12h @io entro il 23/10/2026', 'Report =2h @io entro il 28/10/2026', 'Bozza @io =1,5h'])
  await openTask(page, 'Analisi')
  await expect(page.locator('#d-estimate')).toHaveValue('12')
  // Nell'elenco degli assegnatari l'assenza si vede
  await expect(page.locator('#d-assignee option').nth(1)).toContainText('assente 26 ott–30 ott')
  await page.keyboard.press('Escape')

  // Attenzioni: il report scade durante le ferie
  await page.locator('[data-insights-toggle]').click()
  await expect(page.locator('[data-signal="due_in_absence"]')).toContainText('Report')

  // Analisi: troppo carico la prima settimana (12 h su 10), ferie la seconda
  await page.evaluate(() => (location.hash = '#/w/analytics'))
  const grid = page.locator('[data-load-grid]')
  await expect(grid.locator('[data-load-cell="2026-10-19"]').first()).toHaveAttribute('data-level', 'over')
  await expect(grid.locator('[data-load-cell="2026-10-19"]').first()).toContainText('12 h')
  await expect(grid.locator('[data-load-cell="2026-10-26"]').first()).toContainText('assente 5 g')
  await grid.locator('[data-load-cell="2026-10-26"]').first().click()
  await expect(page.locator('[data-load-detail]')).toContainText('Report')
  await expect(page.locator('[data-load-detail] [data-in-absence]')).toBeVisible()
})

test('salute e PC pronti: anello nella barra laterale, andamento in Analisi, matrice dei PC, PC nell’elenco degli assegnatari', async ({ page }) => {
  // Workspace di rete (le verifiche dei PC si condividono solo in rete)
  const id = Math.random().toString(36).slice(2, 7)
  const pick = (p: string) => page.evaluate((x) => Object.assign(window, { __pgmPickFolder: x }), p)
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Team')
  await pick(`/rete/progetti-${id}`)
  await page.getByRole('button', { name: 'Scegli la cartella dei progetti' }).click()
  await pick(`/rete/dati-${id}`)
  await page.getByRole('button', { name: 'Scegli la cartella Dati Todo Doto' }).click()
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'segreto1')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
  await createProject(page, 'Portale')
  const projectId = (await page.evaluate(() => location.hash)).match(/\/p\/([^/?]+)/)![1]!

  // Node.js manca su questo PC
  await page.evaluate(() => Object.assign(window, { __pgmChecks: { 'node -v': { code: 9009, stdout: '', stderr: "'node' is not recognized", timedOut: false } } }))
  await page.locator('aside').first().getByRole('link', { name: /^Stack( \d+)?$/ }).click()
  await page.getByRole('button', { name: 'Aggiungi stack tecnologico' }).click()
  await page.getByPlaceholder('Es. TypeScript, C#, Rust').fill('TypeScript')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Salva' }).click()
  await expect(page.locator('[data-prereq="Node.js"]')).toHaveAttribute('data-status', 'missing')

  await page.locator('aside').first().getByRole('link', { name: /^Todo( \d+)?$/ }).click()
  await addTasks(page, ['Uno @io entro il 01/10/2026', 'Due entro il 02/10/2026', 'Tre entro il 03/10/2026'])
  const ring = page.locator('aside').first().locator('[data-health]')
  await expect(ring).toHaveAttribute('data-health', 'red')
  await expect(ring).toHaveAttribute('title', /3 in ritardo/)
  await expect(ring).toHaveAttribute('title', /1 PC non pronto/)

  // Il PC si vede accanto al nome nell'elenco degli assegnatari
  await openTask(page, 'Uno')
  await expect(page.locator('#d-assignee option').nth(1)).toContainText('al PC manca un programma')
  await page.keyboard.press('Escape')

  // Una settimana passata «in salute», scritta come la scriverebbe un altro PC
  await page.evaluate(
    async ([dir, pid]) => {
      const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeTextAtomic(p: string, t: string): Promise<void> }> }).__pgmFs()
      await fs.writeTextAtomic(`${dir}/health/2026-01-05.json`, JSON.stringify({ week: '2026-01-05', at: '2026-01-05T09:00:00Z', projects: { [pid!]: 'green' } }))
    },
    [`/rete/dati-${id}`, projectId],
  )
  await page.evaluate(() => (location.hash = '#/w/analytics'))
  const trend = page.locator('[data-health-trend] [data-health-row="Portale"]')
  await expect(trend.locator('[data-health-now]')).toHaveAttribute('data-health-now', 'red')
  await expect(trend).toContainText('3 in ritardo')
  await expect(trend.locator('[title="In salute"]')).toHaveCount(1)
  await expect(page.locator('[data-pc-matrix] [data-pc-row="Portale"] [data-pc-state]')).toHaveAttribute('data-pc-state', 'missing')
})
