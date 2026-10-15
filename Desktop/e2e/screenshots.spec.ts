import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Genera le schermate del sito (Web/assets/screens/*.png, 1600×1000) dalla
 * build corrente, con il workspace di esempio. Non fa parte della suite:
 *
 *   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 *
 * Per le pagine riservate ai piani (cronologia, timeline) serve una licenza
 * valida: PGM_LICENSE_FILE=percorso/license.json (emessa con scripts/issue-license.mjs).
 */
const OUT = fileURLToPath(new URL('../../Web/assets/screens/', import.meta.url))
const enabled = process.env.SCREENSHOTS === '1'
test.skip(!enabled, 'solo con SCREENSHOTS=1')
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'light' })

const shot = (page: Page, name: string) => page.screenshot({ path: OUT + name, fullPage: false })
const rows = (page: Page) => page.locator('[role=button][tabindex="0"]')

async function openDemo(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('pgm:theme', 'light'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Esplora un esempio' }).click()
  await expect(page.getByRole('heading', { name: 'Esempio: Studio Rossi' })).toBeVisible()
}

async function setDark(page: Page, dark: boolean) {
  const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'))
  if (isDark !== dark) await page.keyboard.press('Control+Shift+L')
}

test('welcome e creazione workspace', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('pgm:theme', 'light'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Primi passi' })).toBeVisible()
  await shot(page, 'welcome.png')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Roadmap Studio')
  await page.fill('input[placeholder^="D:"]', 'Z:\\Condivisa\\Roadmap')
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'segreto1')
  await shot(page, 'create-workspace.png')
})

test('workspace di esempio: home, lista, dettaglio, nuovo elemento, allegati, tema scuro', async ({ page }) => {
  await openDemo(page)
  await setDark(page, false)
  await shot(page, 'home.png')
  await page.locator('aside').getByText('Sito web Bianchi Srl').first().click()
  await expect(rows(page).first()).toContainText('Login con SPID')
  await shot(page, 'project-list.png')
  // Dettaglio con domanda e commento
  await rows(page).first().click()
  await expect(page.getByText('Il cliente vuole anche l’accesso con CIE')).toBeVisible()
  await shot(page, 'project-detail.png')
  await page.keyboard.press('Escape')
  // Allegati
  await page.getByRole('button', { name: /^Allegati/ }).click()
  await expect(page.getByText('Mockup Figma')).toBeVisible()
  await shot(page, 'attachments.png')
  await page.getByRole('button', { name: /^Da fare/ }).click()
  // Tema scuro: lista e dialog nuovo elemento
  await setDark(page, true)
  await shot(page, 'project-dark.png')
  await page.getByRole('button', { name: 'Nuovo elemento' }).click()
  await page.fill('#i-title', 'Verifica accessibilità del portale')
  await page.fill('#i-notes', 'Controllo WCAG 2.2 sulle pagine pubbliche prima della consegna.')
  await page.getByRole('dialog').locator('select[title^="Priorità"]').selectOption('alta')
  await shot(page, 'new-item-dark.png')
  await setDark(page, false)
})

test('cronologia e timeline con licenza Business', async ({ page }) => {
  const file = process.env.PGM_LICENSE_FILE
  test.skip(!file, 'serve PGM_LICENSE_FILE')
  const license = readFileSync(file!, 'utf8')
  await openDemo(page)
  await setDark(page, false)
  // La creazione del workspace di esempio ha già riempito la cronologia; completo un elemento in più
  await page.locator('aside').getByText('Gestionale magazzino').first().click()
  await rows(page).first().getByTitle('Segna come completato').click()
  // Licenza
  await page.getByRole('button', { name: /Esempio: Studio Rossi/ }).first().click()
  await page.getByRole('menuitem', { name: 'Piano e licenza' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill(license)
  await dialog.getByRole('button', { name: 'Attiva', exact: true }).click()
  await expect(page.getByText('Licenza Business attivata')).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Licenza Business attivata')).toBeHidden({ timeout: 10_000 })
  await page.getByRole('button', { name: /Esempio: Studio Rossi/ }).first().click()
  await page.getByRole('menuitem', { name: 'Cronologia operazioni' }).click()
  await expect(page.locator('section li').first()).toBeVisible()
  await shot(page, 'audit.png')
  await page.getByTitle('Timeline delle scadenze').click()
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()
  await expect(page.locator('section').first()).toBeVisible()
  await shot(page, 'timeline.png')
})
