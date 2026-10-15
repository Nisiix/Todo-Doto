import { expect, test, type Page } from '@playwright/test'

/** Import da CSV/Trello e timeline, visti dall'utente nel browser. */

async function createNetworkWithTrial(page: Page, name = 'Rete') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', name)
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'segreto1')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(name) }).first().click()
  await page.getByRole('menuitem', { name: 'Piano e licenza' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Avvia la prova di 14 giorni/ }).click()
  await expect(dialog).toContainText('Team in prova')
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
}

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', name)
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('import da CSV incollato: anteprima, etichette create, elementi nei contenitori giusti', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Import')
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await createProject(page, 'Da Excel')
  await page.getByRole('button', { name: 'importa da CSV o Trello' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Importa elementi')
  await dialog.getByText('Oppure incolla il testo').click()
  await dialog.locator('textarea').fill('Titolo;Priorità;Scadenza;Etichetta;Contenitore\nLogin SPID;Alta;30/11/2026;Bug;Da fare\nFatto ieri;Bassa;;;Completati\nSenza nulla;;;;')
  await dialog.getByRole('button', { name: 'Analizza' }).click()
  await expect(dialog).toContainText('3 elementi')
  await expect(dialog).toContainText('2 da fare · 1 completati · 1 con scadenza')
  await expect(dialog).toContainText('Etichette da creare: Bug')
  await dialog.getByRole('button', { name: /^Importa 3/ }).click()
  await expect(page.getByText('3 elementi importati')).toBeVisible()
  const rows = page.locator('[role=button][tabindex="0"]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Login SPID')
  await expect(rows.nth(0).getByTitle('Etichetta: Bug').first()).toBeVisible()
  await page.getByRole('button', { name: /^Completati/ }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.nth(0)).toContainText('Fatto ieri')
})

test('import da JSON Trello', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Trello')
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await createProject(page, 'Bacheca')
  await page.getByRole('button', { name: 'Esporta o stampa' }).click()
  await page.getByRole('menuitem', { name: 'Importa da CSV o Trello…' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Oppure incolla il testo').click()
  const board = { name: 'Sito', lists: [{ id: 'a', name: 'To do' }, { id: 'b', name: 'Done' }], cards: [{ name: 'Carta uno', idList: 'a', labels: [{ name: 'Urgente', color: 'red' }] }, { name: 'Carta fatta', idList: 'b' }] }
  await dialog.locator('textarea').fill(JSON.stringify(board))
  await dialog.getByRole('button', { name: 'Analizza' }).click()
  await expect(dialog).toContainText('bacheca Trello «Sito»')
  await expect(dialog).toContainText('2 elementi')
  await dialog.getByRole('button', { name: /^Importa 2/ }).click()
  await expect(page.getByText('2 elementi importati')).toBeVisible()
  await expect(page.locator('[role=button][tabindex="0"]').first()).toContainText('Carta uno')
})

test('timeline: riquadro nel piano Team, colonne con il piano Business (licenza di test non disponibile): verifica il gate', async ({ page }) => {
  await createNetworkWithTrial(page)
  await createProject(page, 'Scadenze')
  await page.getByTitle('Timeline delle scadenze').click()
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()
  // La prova è del piano Team: la timeline è Business
  await expect(page.getByText('Timeline delle scadenze')).toBeVisible()
  await expect(page.getByText('inclusa nel piano Business')).toBeVisible()
})
