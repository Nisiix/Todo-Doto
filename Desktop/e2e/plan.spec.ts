import { expect, test, type Page } from '@playwright/test'

/**
 * Piani, licenza, workspace di esempio ed export, visti dall'utente nel
 * browser (filesystem in memoria).
 */

async function createLocalWorkspace(page: Page, name = 'Roadmap Sviluppo') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', name)
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('primi passi e workspace di esempio', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Primi passi' })).toBeVisible()
  await page.getByRole('button', { name: 'Esplora un esempio' }).click()
  await expect(page.getByRole('heading', { name: 'Esempio: Studio Rossi' })).toBeVisible()
  // Banner del workspace di esempio e progetti precompilati
  await expect(page.getByText('workspace di esempio')).toBeVisible()
  await page.locator('aside').getByText('Sito web Bianchi Srl').first().click()
  await expect(page.getByText('Login con SPID per l’area riservata').first()).toBeVisible()
  // Dal banner si torna alla creazione del proprio workspace
  await page.getByRole('button', { name: 'Crea il mio workspace' }).click()
  await expect(page.getByRole('dialog')).toContainText('Nuovo workspace')
})

test('piano Free: export bloccato con rimando ai piani; dialog Piano e licenza', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', 'Export')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByRole('button', { name: 'Esporta o stampa' }).click()
  await page.getByRole('menuitem', { name: 'Esporta CSV (Excel)' }).click()
  await expect(page.getByText('disponibile nel piano Team')).toBeVisible()
  // Dal toast ai piani
  await page.getByRole('button', { name: 'Vedi piani' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Piano e licenza')
  await expect(dialog).toContainText('Free')
  await expect(dialog).toContainText('49,90 €/anno')
  // Una licenza finta viene rifiutata con un messaggio chiaro
  await dialog.locator('textarea').fill('{"v":1,"id":"x","plan":"team","seats":10,"issuedTo":"a","email":"b","issuedAt":"2026-01-01","expiresAt":"2027-01-01","sig":"AAAA"}')
  await dialog.getByRole('button', { name: 'Attiva' }).click()
  await expect(dialog.getByText(/firma della licenza non è/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
  await expect(dialog).toBeHidden()
})

test('cronologia e Drive mostrano il riquadro del piano; Impostazioni ha licenza, backup e informazioni', async ({ page }) => {
  await createLocalWorkspace(page)
  await page.getByRole('button', { name: /Roadmap Sviluppo/ }).first().click()
  await page.getByRole('menuitem', { name: 'Cronologia operazioni' }).click()
  await expect(page.getByText('inclusa nel piano Team')).toBeVisible()
  await page.getByTitle('Google Drive').click()
  await expect(page.getByText('Replica di una cartella Google Drive')).toBeVisible()
  await page.getByTitle('Impostazioni').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Piano e licenza')
  await expect(dialog).toContainText('Backup')
  await expect(dialog).toContainText('Informazioni')
  await expect(dialog).toContainText('Disponibile solo nell’app desktop.')
  await dialog.getByRole('button', { name: 'Novità' }).click()
  await expect(page.getByRole('dialog').last()).toContainText('Novità nella versione')
})

test('workspace di rete: prova di 14 giorni dal dialog e piano Team attivo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Crea workspace' }).first().click()
  await page.fill('#ws-name', 'Rete')
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await page.getByText('Condiviso in rete').click()
  await page.fill('#ws-pw', 'segreto1')
  await page.fill('#ws-pw2', 'segreto1')
  await page.getByRole('button', { name: 'Crea workspace' }).last().click()
  await expect(page.getByRole('heading', { name: 'Rete' })).toBeVisible()
  await page.getByRole('button', { name: /Rete/ }).first().click()
  await page.getByRole('menuitem', { name: 'Piano e licenza' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('1 membro · piano con 3 posti')
  await dialog.getByRole('button', { name: /Avvia la prova di 14 giorni/ }).click()
  await expect(dialog).toContainText('Team in prova · 14 giorni rimasti')
  await dialog.getByRole('button', { name: 'Chiudi', exact: true }).last().click()
  // Ora l'export funziona (nel browser scarica il file)
  await page.getByRole('button', { name: 'Progetto' }).first().click()
  await page.fill('#p-name', 'Con prova')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByRole('button', { name: 'Esporta o stampa' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Esporta CSV (Excel)' }).click()
  expect((await download).suggestedFilename()).toBe('con-prova.csv')
  await expect(page.getByText('CSV salvato')).toBeVisible()
  // Stampa: pagina pulita con tabella
  await page.getByRole('button', { name: 'Esporta o stampa' }).click()
  await page.getByRole('menuitem', { name: 'Stampa o salva PDF' }).click()
  await expect(page.getByRole('button', { name: 'Stampa o salva come PDF' })).toBeVisible()
  await expect(page.getByText('Il progetto non ha ancora elementi.')).toBeVisible()
  await page.getByRole('button', { name: 'Torna al progetto' }).click()
  await expect(page.getByRole('heading', { name: 'Con prova' })).toBeVisible()
  // Con la prova attiva la cronologia è consultabile
  await page.getByRole('button', { name: /Rete/ }).first().click()
  await page.getByRole('menuitem', { name: 'Cronologia operazioni' }).click()
  await expect(page.getByRole('heading', { name: 'Cronologia' })).toBeVisible()
  await expect(page.locator('section li', { hasText: 'Progetto creato' }).first()).toBeVisible()
  await expect(page.getByText('Il piano Team mostra gli ultimi 90 giorni')).toBeHidden()
})
