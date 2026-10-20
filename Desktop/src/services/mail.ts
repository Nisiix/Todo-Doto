/**
 * Email e Microsoft Teams: testi dei messaggi, riepilogo del mattino e
 * protezione della password SMTP. Funzioni pure (niente store): l'invio lo
 * fanno lo store (stores/outbox.ts) e il backend (office.rs).
 *
 * Cosa esce dal workspace: titolo del task (prima riga), progetto, chi e cosa,
 * stato e scadenze. Mai descrizioni, allegati, stack o percorsi; il testo di
 * commenti e domande solo nel messaggio a chi è stato menzionato.
 */
import dayjs from 'dayjs'
import { fromB64, PBKDF2_ITERATIONS, toB64 } from './crypto'
import { dueState, firstLine } from './items'
import type { Change } from './changes'
import { DATE, defineMessages } from '@/i18n'
import type { Item, Project, User } from '@/types'

const m = defineMessages({
  it: {
    created: (who: string) => `${who} ha creato il task`,
    completed: (who: string) => `${who} ha completato il task`,
    reopened: (who: string) => `${who} ha riaperto il task`,
    assigned: (who: string, to: string) => `${who} ha assegnato il task a ${to}`,
    question: (who: string) => `${who} ha fatto una domanda`,
    answer: (who: string) => `${who} ha risposto a una domanda`,
    comment: (who: string) => `${who} ha scritto un commento`,
    mentioned: (who: string) => `${who} ti ha menzionato`,
    assignedToYou: (who: string) => `${who} ti ha assegnato un task`,
    project: 'Progetto',
    due: 'Scadenza',
    task: 'Task',
    subjectMention: (p: string, t: string) => `[${p}] Ti hanno menzionato: ${t}`,
    subjectAssigned: (p: string, t: string) => `[${p}] Task assegnato a te: ${t}`,
    digestSubject: (d: string) => `Todo Doto · il punto del ${d}`,
    digestTitle: (name: string) => `Buongiorno ${name}, ecco il punto della giornata`,
    overdue: 'In ritardo',
    dueSoon: 'In scadenza nei prossimi 3 giorni',
    yours: 'assegnato a te',
    doneYesterday: 'Completati nelle ultime 24 ore',
    openQuestions: (n: number) => (n === 1 ? '1 domanda aperta' : `${n} domande aperte`),
    footer: 'Messaggio inviato da Todo Doto. Per non riceverlo più: Impostazioni › Email e Teams.',
    open: 'Apri Todo Doto per i dettagli.',
    test: 'Todo Doto: email di prova',
    testBody: 'Se leggi questo messaggio, l’invio delle email del workspace funziona.',
  },
  en: {
    created: (who: string) => `${who} created the task`,
    completed: (who: string) => `${who} completed the task`,
    reopened: (who: string) => `${who} reopened the task`,
    assigned: (who: string, to: string) => `${who} assigned the task to ${to}`,
    question: (who: string) => `${who} asked a question`,
    answer: (who: string) => `${who} answered a question`,
    comment: (who: string) => `${who} wrote a comment`,
    mentioned: (who: string) => `${who} mentioned you`,
    assignedToYou: (who: string) => `${who} assigned you a task`,
    project: 'Project',
    due: 'Due',
    task: 'Task',
    subjectMention: (p: string, t: string) => `[${p}] You were mentioned: ${t}`,
    subjectAssigned: (p: string, t: string) => `[${p}] Task assigned to you: ${t}`,
    digestSubject: (d: string) => `Todo Doto · your day, ${d}`,
    digestTitle: (name: string) => `Good morning ${name}, here is your day`,
    overdue: 'Overdue',
    dueSoon: 'Due in the next 3 days',
    yours: 'assigned to you',
    doneYesterday: 'Completed in the last 24 hours',
    openQuestions: (n: number) => (n === 1 ? '1 open question' : `${n} open questions`),
    footer: 'Message sent by Todo Doto. To stop receiving it: Settings › Email and Teams.',
    open: 'Open Todo Doto for the details.',
    test: 'Todo Doto: test email',
    testBody: 'If you can read this message, sending the workspace emails works.',
  },
})

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// --- password SMTP: cifrata con una chiave ricavata dalla password del workspace -------

const enc = new TextEncoder()
const dec = new TextDecoder()
async function keyFrom(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
/** `v1.<iterazioni>.<sale>.<iv>.<dati>` (base64): chi conosce la password del workspace la decifra, nessun altro. */
export async function sealSecret(secret: string, workspacePassword: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(workspacePassword, salt, PBKDF2_ITERATIONS)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret))
  return ['v1', PBKDF2_ITERATIONS, toB64(salt), toB64(iv), toB64(ct)].join('.')
}
export async function openSecret(sealed: string, workspacePassword: string): Promise<string | null> {
  const [v, it, salt, iv, ct] = sealed.split('.')
  if (v !== 'v1' || !it || !salt || !iv || !ct) return null
  try {
    const key = await keyFrom(workspacePassword, fromB64(salt), Number(it))
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct)))
  } catch {
    return null
  }
}

// --- eventi: Teams e email a chi è coinvolto -----------------------------------------------

/** Eventi che si possono mandare al canale Teams di un progetto. */
export const TEAMS_EVENTS = ['item_created', 'item_completed', 'assigned', 'question', 'mention'] as const
export type TeamsEvent = (typeof TEAMS_EVENTS)[number]

export interface OutgoingEvent {
  kind: TeamsEvent | 'answer' | 'comment' | 'reopened'
  item: Item
  /** Chi ha fatto la modifica. */
  by: string
  /** Utenti menzionati (o l'assegnatario). */
  to: string[]
  /** Testo di commento/domanda/risposta (solo per chi è menzionato). */
  text: string
}

/** Dagli eventi delle notifiche (services/changes.ts) a quelli da inviare. */
export function outgoingEvents(next: Project, changes: Change[]): OutgoingEvent[] {
  const items = new Map(next.items.map((i) => [i.id, i]))
  const out: OutgoingEvent[] = []
  for (const c of changes) {
    const item = items.get(c.itemId)
    if (!item) continue
    const base = { item, by: c.byId, to: [] as string[], text: '' }
    if (c.type === 'item_created') {
      out.push({ ...base, kind: 'item_created' })
      if (item.assigneeId && item.assigneeId !== c.byId) out.push({ ...base, kind: 'assigned', to: [item.assigneeId] })
    } else if (c.type === 'item_completed') out.push({ ...base, kind: item.bucket === 'done' ? 'item_completed' : 'reopened' })
    else if (c.type === 'assigned') out.push({ ...base, kind: 'assigned', to: c.mentions })
    else if (c.type === 'question' || c.type === 'answer' || c.type === 'comment') {
      const text = c.text
      out.push({ ...base, kind: c.type, text })
      const to = c.mentions.filter((id) => id !== c.byId)
      if (to.length) out.push({ ...base, kind: 'mention', to, text })
    }
  }
  return out
}

/** Riga che descrive l'evento (per Teams e per l'oggetto delle email). */
export function eventLine(e: OutgoingEvent, name: (id: string) => string): string {
  const who = name(e.by)
  switch (e.kind) {
    case 'item_created':
      return m.created(who)
    case 'item_completed':
      return m.completed(who)
    case 'reopened':
      return m.reopened(who)
    case 'assigned':
      return m.assigned(who, e.to.map(name).join(', '))
    case 'question':
      return m.question(who)
    case 'answer':
      return m.answer(who)
    case 'comment':
      return m.comment(who)
    case 'mention':
      return m.mentioned(who)
  }
}

/** Scheda Adaptive Card per il canale Teams del progetto. */
export function teamsCard(project: Project, e: OutgoingEvent, name: (id: string) => string) {
  const facts = [
    { title: m.project, value: project.name },
    { title: m.task, value: firstLine(e.item.title) },
  ]
  if (e.item.dueDate) facts.push({ title: m.due, value: dayjs(e.item.dueDate).format(DATE.date) })
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: eventLine(e, name), weight: 'Bolder', wrap: true },
      { type: 'FactSet', facts },
    ],
  }
}

/** Email a chi è menzionato o a cui è stato assegnato il task. */
export function personalMail(project: Project, e: OutgoingEvent, name: (id: string) => string) {
  const title = firstLine(e.item.title)
  const subject = e.kind === 'assigned' ? m.subjectAssigned(project.name, title) : m.subjectMention(project.name, title)
  const lead = e.kind === 'assigned' ? m.assignedToYou(name(e.by)) : m.mentioned(name(e.by))
  const due = e.item.dueDate ? `${m.due}: ${dayjs(e.item.dueDate).format(DATE.date)}` : ''
  const text = [lead, '', `${m.project}: ${project.name}`, `${m.task}: ${title}`, due, e.text ? `\n«${e.text}»` : '', '', m.open, '', m.footer].filter((l) => l !== null).join('\n')
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1d1b22">
<p style="font-weight:600">${esc(lead)}</p>
<p>${esc(m.project)}: <b>${esc(project.name)}</b><br>${esc(m.task)}: <b>${esc(title)}</b>${due ? `<br>${esc(due)}` : ''}</p>
${e.text ? `<blockquote style="margin:0;padding:6px 12px;border-left:3px solid #6b4fbf;color:#55505f">${esc(e.text)}</blockquote>` : ''}
<p style="color:#8a8494;font-size:12px">${esc(m.open)}<br>${esc(m.footer)}</p></div>`
  return { subject, text, html }
}

// --- riepilogo del mattino ---------------------------------------------------------------------

export interface Digest {
  overdue: { project: Project; item: Item; mine: boolean }[]
  dueSoon: { project: Project; item: Item; mine: boolean }[]
  done: { project: Project; item: Item }[]
  openQuestions: number
}

/** Il punto della giornata per un utente, dai soli progetti che vede. */
export function buildDigest(user: Pick<User, 'id'>, projects: Project[], now = dayjs()): Digest {
  const d: Digest = { overdue: [], dueSoon: [], done: [], openQuestions: 0 }
  const since = now.subtract(1, 'day')
  for (const p of projects) {
    for (const it of p.items) {
      const mine = it.assigneeId === user.id
      if (it.bucket === 'todo' && it.dueDate) {
        const st = dueState(it.dueDate, 3, now)
        if (st === 'overdue') d.overdue.push({ project: p, item: it, mine })
        else if (st === 'soon') d.dueSoon.push({ project: p, item: it, mine })
      }
      if (it.bucket === 'done' && it.completedAt && dayjs(it.completedAt).isAfter(since)) d.done.push({ project: p, item: it })
      if (it.bucket === 'todo') d.openQuestions += it.questions.filter((q) => !q.resolved).length
    }
  }
  const order = (a: { mine: boolean; item: Item }, b: { mine: boolean; item: Item }) => Number(b.mine) - Number(a.mine) || (a.item.dueDate ?? '').localeCompare(b.item.dueDate ?? '')
  d.overdue.sort(order)
  d.dueSoon.sort(order)
  return d
}
export const digestIsEmpty = (d: Digest) => !d.overdue.length && !d.dueSoon.length && !d.done.length && !d.openQuestions

export function digestMail(user: Pick<User, 'displayName'>, d: Digest, now = dayjs()) {
  const subject = m.digestSubject(now.format(DATE.date))
  const line = (x: { project: Project; item: Item; mine?: boolean }) =>
    `${x.item.dueDate ? dayjs(x.item.dueDate).format(DATE.dayMonth) + ' · ' : ''}${firstLine(x.item.title)} — ${x.project.name}${x.mine ? ` (${m.yours})` : ''}`
  const sections: [string, string[]][] = [
    [m.overdue, d.overdue.map(line)],
    [m.dueSoon, d.dueSoon.map(line)],
    [m.doneYesterday, d.done.map(line)],
  ]
  const text = [
    m.digestTitle(user.displayName),
    '',
    ...sections.filter(([, l]) => l.length).flatMap(([t, l]) => [t, ...l.map((x) => `- ${x}`), '']),
    d.openQuestions ? m.openQuestions(d.openQuestions) : '',
    '',
    m.footer,
  ].join('\n')
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1d1b22">
<p style="font-size:16px;font-weight:700">${esc(m.digestTitle(user.displayName))}</p>
${sections
  .filter(([, l]) => l.length)
  .map(([t, l]) => `<p style="margin:14px 0 4px;font-weight:600">${esc(t)}</p><ul style="margin:0;padding-left:18px">${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)
  .join('')}
${d.openQuestions ? `<p>${esc(m.openQuestions(d.openQuestions))}</p>` : ''}
<p style="color:#8a8494;font-size:12px">${esc(m.footer)}</p></div>`
  return { subject, text, html }
}

export const testMail = () => ({ subject: m.test, text: m.testBody, html: `<p style="font-family:Segoe UI,Arial,sans-serif">${esc(m.testBody)}</p>` })
