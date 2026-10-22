import { expect, test, type Page } from '@playwright/test'

/**
 * Feedback, donazioni e avviso di nuova versione. GitHub e PayPal sono simulati:
 * nessuna richiesta esce dal test.
 */

let pageErrors: string[] = []
test.beforeEach(async ({ page, context }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // Pagine esterne aperte dai pulsanti: risposta vuota, si controlla solo l'indirizzo
  await context.route(/^https:\/\/(github\.com|www\.paypal\.com|nisiix\.github\.io)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>ok</title>' }))
  await page.addInitScript(() => {
    Object.assign(window, { __pgmSeedFiles: { '/appdata/config.json': JSON.stringify({ ai: { bannerDismissed: true, autoDetectDone: true } }) } })
  })
})
test.afterEach(() => expect(pageErrors).toEqual([]))

async function createLocalWorkspace(page: Page, name = 'Roadmap Sviluppo') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', name)
  await page.getByRole('button', { name: 'Scegli la cartella dei progetti' }).click()
  await page.getByRole('button', { name: 'Scegli la cartella Dati Todo Doto' }).click()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}
async function workspaceMenu(page: Page, item: string) {
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: item }).click()
}
/** Ultima Release simulata su GitHub (null = nessuna Release). */
async function fakeLatest(page: Page, tag: string | null) {
  await page.route('https://api.github.com/repos/Nisiix/Todo-Doto/releases/latest', (r) =>
    tag
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag_name: tag, html_url: `https://github.com/Nisiix/Todo-Doto/releases/tag/${tag}`, published_at: '2026-11-02T10:00:00Z', body: 'Novità', draft: false, prerelease: false }) })
      : r.fulfill({ status: 404, body: '{}' }),
  )
}

test('invia un feedback: problema, idea, domanda su GitHub con la versione; email a nisos@live.it', async ({ page, context }) => {
  // Dalla schermata iniziale, anche senza workspace
  await page.goto('/')
  await page.locator('[data-welcome-feedback]').click()
  const fb = page.locator('[data-feedback]')
  await expect(fb.locator('[data-feedback-version]')).toHaveText('Versione 0.7.0')
  const [issue] = await Promise.all([context.waitForEvent('page'), fb.locator('[data-feedback-kind="bug"]').click()])
  expect(issue.url()).toBe('https://github.com/Nisiix/Todo-Doto/issues/new?template=bug_report.yml&version=0.7.0&os=Linux')
  await issue.close()
  await expect(fb).toHaveCount(0)

  // Dal menu del workspace: idea e domanda nelle discussioni
  await createLocalWorkspace(page)
  await workspaceMenu(page, 'Invia un feedback')
  const [idea] = await Promise.all([context.waitForEvent('page'), fb.locator('[data-feedback-kind="idea"]').click()])
  expect(idea.url()).toContain('/discussions/new?category=ideas&version=0.7.0')
  await idea.close()

  // Email: il collegamento mailto con oggetto e versione
  await page.evaluate(() => {
    const w = window as unknown as { __opened: string[]; open: (u: string) => null }
    w.__opened = []
    w.open = (u: string) => (w.__opened.push(u), null)
  })
  await workspaceMenu(page, 'Invia un feedback')
  await fb.locator('[data-feedback-kind="email"]').click()
  const mail = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened[0]!)
  expect(mail).toMatch(/^mailto:nisos@live\.it\?subject=Todo%20Doto%200\.7\.0%20%C2%B7%20Feedback&body=/)
})

test('sostieni Todo Doto: dal menu, PayPal e indirizzo nisos@live.it da copiare', async ({ page, context }) => {
  await createLocalWorkspace(page)
  await workspaceMenu(page, 'Sostieni Todo Doto')
  const d = page.locator('[data-donate-dialog]')
  await expect(d.locator('[data-donate-address]')).toHaveText('nisos@live.it')
  await d.locator('[data-donate-copy]').click()
  await expect(page.getByText('Indirizzo copiato')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('nisos@live.it')
  const [paypal] = await Promise.all([context.waitForEvent('page'), d.locator('[data-donate-paypal]').click()])
  expect(paypal.url()).toBe('https://www.paypal.com/donate/?business=nisos%40live.it&item_name=Todo+Doto&currency_code=EUR')
  await paypal.close()
  // Anche dalla palette dei comandi
  await page.keyboard.press('Escape')
  await expect(d).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('>dona')
  await page.keyboard.press('Enter')
  await expect(d).toHaveCount(1)
})

const updatesConfig = (page: Page) =>
  page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ readText(p: string): Promise<string> }> }).__pgmFs()
    return JSON.parse(await fs.readText('/appdata/config.json')).updates
  })

test('nuova versione: avviso in cima, «Più tardi» non lo ripropone, controllo dalle Impostazioni', async ({ page, context }) => {
  await page.addInitScript(() => Object.assign(window, { __pgmUpdates: true }))
  await fakeLatest(page, 'v9.1.0')
  await page.goto('/')
  const banner = page.locator('[data-update-banner]')
  await expect(banner).toContainText('È disponibile Todo Doto 9.1.0 (questa è la 0.7.0)')
  const [dl] = await Promise.all([context.waitForEvent('page'), banner.locator('[data-update-download]').click()])
  expect(dl.url()).toBe('https://nisiix.github.io/Todo-Doto/#download')
  await dl.close()
  await banner.locator('[data-update-later]').click()
  await expect(banner).toHaveCount(0)
  // La versione messa da parte resta nella configurazione di questo PC
  expect(await updatesConfig(page)).toMatchObject({ check: true, skipped: '9.1.0', latest: { version: '9.1.0' } })

  // Impostazioni: versione, «Controlla ora», disattivazione
  await createLocalWorkspace(page)
  await workspaceMenu(page, 'Impostazioni')
  const box = page.locator('[data-app-version]')
  await expect(box).toContainText('Todo Doto 0.7.0')
  await box.locator('[data-check-updates]').click()
  await expect(box.locator('[data-check-result]')).toContainText('È disponibile la versione 9.1.0')
  await page.unroute('https://api.github.com/repos/Nisiix/Todo-Doto/releases/latest')
  await fakeLatest(page, 'v0.7.0')
  await box.locator('[data-check-updates]').click()
  await expect(box.locator('[data-check-result]')).toHaveText('Hai l’ultima versione.')
  await box.locator('[data-auto-check]').uncheck()
  await expect.poll(() => updatesConfig(page)).toMatchObject({ check: false, latest: { version: '0.7.0' } })
})
