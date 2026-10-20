import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { useOutboxStore } from './outbox'
import type { MailMessage, SmtpConfig } from '@/services/office'
import { MAIL_DEFAULTS } from '@/types'

const WEBHOOK = 'https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x'

function fakeOffice() {
  const sent = { teams: [] as { url: string; body: any }[], outlook: [] as MailMessage[], smtp: [] as { c: SmtpConfig; m: MailMessage }[] }
  Object.assign(window, {
    __pgmOffice: {
      teams: (url: string, body: unknown) => (sent.teams.push({ url, body }), 200),
      mailOutlook: (m: MailMessage) => (sent.outlook.push(m), { ok: true, code: 0, message: '' }),
      mailSmtp: (c: SmtpConfig, m: MailMessage) => (sent.smtp.push({ c, m }), { ok: true, code: 0, message: '' }),
    },
  })
  return sent
}
const flush = () => new Promise((r) => setTimeout(r, 30))

async function setup(path: string) {
  const ws = useWorkspaceStore()
  await ws.create({ path, name: 'Studio', mode: 'network', password: 'segreto1' })
  const p = (await ws.createProject({ name: 'Sito', description: '', folderId: null, members: [] }))!
  await ws.storage!.mutateUsers((f) =>
    f.users.push({ id: 'usr_c', username: 'carla', hostname: 'PC3', displayName: 'Carla', role: 'member', createdAt: '', sid: '', domain: '', email: 'carla@studio.it', mailOn: ['mention', 'assigned', 'digest'], weeklyHours: 0, absences: [] }),
  )
  await ws.refresh()
  return { ws, p }
}

describe('email e Teams', () => {
  beforeEach(async () => {
    await useSessionStore().init()
  })
  afterEach(() => Object.assign(window, { __pgmOffice: undefined }))

  it('Teams: le azioni di questo utente nel progetto collegato diventano schede nel canale', async () => {
    const sent = fakeOffice()
    const { ws, p } = await setup('/rete/mail1')
    useOutboxStore()
    await ws.setProjectTeams(p.id, { url: WEBHOOK, events: ['item_created', 'item_completed'] })
    const it = (await ws.addItem(p.id, { title: 'Pagina contatti' }))!
    await ws.moveItem(p.id, it.id, 'done')
    await flush()
    const texts = sent.teams.map((t) => t.body.attachments[0].content.body[0].text)
    expect(texts).toEqual([expect.stringMatching(/ha creato il task/), expect.stringMatching(/ha completato il task/)])
    expect(JSON.stringify(sent.teams[0]!.body)).toContain('Pagina contatti')
    // Un indirizzo che non è di Teams non si collega
    await ws.setProjectTeams(p.id, { url: 'https://example.com/hook', events: ['item_created'] })
    await ws.addItem(p.id, { title: 'Altro' })
    await flush()
    expect(sent.teams).toHaveLength(2)
  })

  it('email a chi è menzionato o riceve un task (con Outlook del PC), solo se l’ha scelto', async () => {
    const sent = fakeOffice()
    const { ws, p } = await setup('/rete/mail2')
    expect(await ws.setMailSettings({ ...structuredClone(MAIL_DEFAULTS), method: 'outlook' })).toBe(true)
    const it = (await ws.addItem(p.id, { title: 'Preventivo' }))!
    await ws.addComment(p.id, it.id, '@Carla puoi controllare?')
    await ws.updateItem(p.id, it.id, { assigneeId: 'usr_c' })
    await flush()
    expect(sent.outlook.map((m) => m.to[0])).toEqual(['carla@studio.it', 'carla@studio.it'])
    expect(sent.outlook[0]!.subject).toContain('Ti hanno menzionato')
    expect(sent.outlook[0]!.text).toContain('@Carla puoi controllare?')
    expect(sent.outlook[1]!.subject).toContain('Task assegnato a te')
    // Carla non vuole più le menzioni
    await ws.storage!.mutateUsers((f) => void (f.users.find((u) => u.id === 'usr_c')!.mailOn = ['digest']))
    await ws.refresh()
    await ws.addComment(p.id, it.id, '@Carla ancora tu')
    await flush()
    expect(sent.outlook).toHaveLength(2)
  })

  it('SMTP: la password è cifrata con quella del workspace e resta leggibile dopo il cambio password', async () => {
    const sent = fakeOffice()
    const { ws } = await setup('/rete/mail3')
    const smtp = { host: 'smtp.studio.it', port: 587, security: 'starttls' as const, from: 'todo@studio.it', user: 'todo', secret: '' }
    expect(await ws.setMailSettings({ ...structuredClone(MAIL_DEFAULTS), method: 'smtp', smtp }, 'pw-smtp')).toBe(true)
    expect(ws.meta!.mail.smtp.secret).not.toContain('pw-smtp')
    expect(await ws.sendMail({ to: ['carla@studio.it'], subject: 'x', text: 'x', html: 'x' })).toBe(true)
    expect(sent.smtp[0]!.c).toMatchObject({ host: 'smtp.studio.it', user: 'todo', password: 'pw-smtp' })
    await ws.changePassword('nuova-pw')
    expect(await ws.sendMail({ to: ['carla@studio.it'], subject: 'y', text: 'y', html: 'y' })).toBe(true)
    expect(sent.smtp[1]!.c.password).toBe('pw-smtp')
  })

  it('riepilogo del mattino: dopo l’ora scelta, una volta al giorno, solo a chi lo vuole e con i progetti che vede', async () => {
    const sent = fakeOffice()
    const { ws, p } = await setup('/rete/mail4')
    await ws.setMailSettings({ ...structuredClone(MAIL_DEFAULTS), method: 'outlook', digest: { enabled: true, hour: 8 } })
    const it = (await ws.addItem(p.id, { title: 'Consegna bozza', status: 'confermato', dueDate: dayjs().subtract(2, 'day').format('YYYY-MM-DD') }))!
    await ws.updateItem(p.id, it.id, { assigneeId: 'usr_c' })
    sent.outlook.length = 0
    const out = useOutboxStore()
    expect(await out.maybeSendDigest(dayjs().hour(7))).toBe(0)
    expect(await out.maybeSendDigest(dayjs().hour(9))).toBe(1)
    expect(sent.outlook[0]!.to).toEqual(['carla@studio.it'])
    expect(sent.outlook[0]!.text).toContain('Consegna bozza')
    expect(sent.outlook[0]!.text).toContain('In ritardo')
    // Stesso giorno, altro PC (memoria locale vuota): il segnaposto nella cartella Dati lo impedisce
    localStorage.clear()
    expect(await out.maybeSendDigest(dayjs().hour(10))).toBe(0)
    expect(sent.outlook).toHaveLength(1)
  })
})
