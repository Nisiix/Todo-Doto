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

/** PDF minimo con una riga di testo per pagina (Helvetica), con la tabella xref corretta. */
function tinyPdf(pages: string[]): string {
  const objs: string[] = []
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

/** IA locale simulata: modelli installati, embedding per gruppi di parole, risposta che cita il passaggio giusto. */
async function fakeAi(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    w.__pgmSeedFiles = { '/appdata/config.json': JSON.stringify({ ai: { enabled: true, bannerDismissed: true, autoDetectDone: true } }) }
    const chats: string[] = []
    w.__pgmAiChats = chats
    const groups = [/redis|backend|prerequisit/i, /accesso|login|sso/i, /fattur/i]
    // Una ricerca senza parole note punta altrove: non somiglia a nessun passaggio
    const vec = (t: string) => {
      const g = groups.map((x) => (x.test(t.replace(/^search_(query|document): /, '')) ? 1 : 0))
      return [...g, t.startsWith('search_query: ') && !g.some(Boolean) ? 1 : 0, 0.05]
    }
    w.__pgmAi = {
      request(req: { url: string; body?: string }) {
        const path = new URL(req.url).pathname
        if (path === '/api/tags') return { status: 200, body: JSON.stringify({ models: [{ name: 'qwen3:4b' }, { name: 'nomic-embed-text:latest' }] }) }
        if (path === '/api/version') return { status: 200, body: '{"version":"0.12.6"}' }
        if (path === '/api/embed') return { status: 200, body: JSON.stringify({ embeddings: (JSON.parse(req.body ?? '{}').input as string[]).map(vec) }) }
        if (path === '/api/chat') {
          const user = (JSON.parse(req.body ?? '{}').messages as { content: string }[])[1]!.content
          chats.push(user)
          const n = (re: RegExp) => Number(new RegExp(`\\[(\\d+)\\] ${re.source}`).exec(user)?.[1] ?? 0)
          const pdf = n(/documento\.pdf/)
          const task = n(/TODO-1 /)
          const answer = /prerequisit/i.test(user)
            ? { answer: `Per il backend servono Redis 7 e Node 22 [${pdf}].`, sources: [pdf], found: true }
            : { answer: `L’accesso con SSO è il task TODO-1 [${task}].`, sources: [task], found: true }
          return { status: 200, body: JSON.stringify({ message: { content: JSON.stringify(answer) } }) }
        }
        return { status: 404, body: '{}' }
      },
    }
  })
}

test('chiedi al progetto: risposta dall’IA locale con le fonti, anche da un PDF allegato; indice salvato sul PC', async ({ page }) => {
  await fakeAi(page)
  await createLocalWorkspace(page)
  await createProject(page, 'Gestionale')
  await addTasks(page, ['Accesso con SSO', 'Esportazione fatture'])

  // Allegato PDF con i prerequisiti (il selettore di file del test sceglie /demo/documento.pdf)
  await page.evaluate(async (pdf) => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ writeBinary(p: string, d: Uint8Array): Promise<void> }> }).__pgmFs()
    await fs.writeBinary('/demo/documento.pdf', new TextEncoder().encode(pdf))
  }, tinyPdf(['Copertina del manuale', 'Il backend richiede Redis 7 e Node 22']))
  await page.locator('aside').first().getByRole('link', { name: /^Allegati( \d+)?$/ }).click()
  await page.getByRole('button', { name: 'Allegato', exact: true }).click()
  await page.getByRole('radio', { name: 'File' }).click()
  await page.getByRole('button', { name: 'Sfoglia' }).click()
  await expect(page.locator('#a-name')).toHaveValue('documento.pdf')
  await page.getByRole('button', { name: 'Crea', exact: true }).click()
  await expect(page.getByText('documento.pdf', { exact: true })).toBeVisible()

  await page.locator('[data-ask-open]').click()
  const ask = page.locator('[data-ask]')
  await ask.locator('[data-ask-input]').fill('Quali prerequisiti servono per il backend?')
  await ask.locator('[data-ask-input]').press('Enter')
  await expect(ask.locator('[data-ask-text]')).toContainText('Per il backend servono Redis 7 e Node 22')
  await expect(ask.locator('[data-ask-sources]')).toContainText('documento.pdf, p. 2')
  await expect(ask.locator('[data-ask-sources]')).toContainText('Il backend richiede Redis 7')
  // Al modello vanno solo i passaggi trovati
  const sent = await page.evaluate(() => (window as unknown as { __pgmAiChats: string[] }).__pgmAiChats.join('\n'))
  expect(sent).toContain('Redis 7')
  expect(sent).not.toContain('Esportazione fatture')

  // Una fonte che è un task: il clic lo apre
  await ask.locator('[data-ask-input]').fill('A che punto è il login?')
  await ask.locator('[data-ask-submit]').click()
  await expect(ask.locator('[data-ask-text]')).toContainText('L’accesso con SSO')
  await ask.locator('[data-ask-cite]').first().click()
  await expect(ask).toHaveCount(0)
  await expect(page.locator('#d-priority')).toHaveCount(1)
  await expect(page.locator('aside:has(#d-priority) textarea').first()).toHaveValue('Accesso con SSO')
  await page.keyboard.press('Escape')

  // Niente di pertinente: nessuna domanda al modello
  await page.locator('[data-ask-open]').click()
  await ask.locator('[data-ask-input]').fill('Chi ha scritto il contratto con il fornitore?')
  await ask.locator('[data-ask-submit]').click()
  await expect(ask.locator('[data-ask-nothing]')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __pgmAiChats: string[] }).__pgmAiChats.length)).toBe(2)

  // Indice degli embedding salvato su questo PC
  const files = await page.evaluate(async () => {
    const fs = await (window as unknown as { __pgmFs: () => Promise<{ readDir(p: string): Promise<string[]> }> }).__pgmFs()
    return fs.readDir('/appdata/ia')
  })
  expect(files).toHaveLength(1)
})
