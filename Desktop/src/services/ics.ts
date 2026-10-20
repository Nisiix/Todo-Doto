/**
 * Calendari delle scadenze in formato iCalendar (.ics, RFC 5545): un file per
 * persona e uno per progetto nella cartella Dati. Outlook, Thunderbird e gli
 * altri programmi di calendario li aprono come calendari in sola lettura: le
 * scadenze compaiono accanto alle riunioni, senza server né account.
 *
 * Eventi di un giorno (DTSTART;VALUE=DATE), testo protetto, righe spezzate a
 * 75 byte. Il contenuto dipende solo dai dati: se nulla cambia, il file resta
 * identico (e non si riscrive). Funzioni pure.
 */
import dayjs from 'dayjs'
import type { Item, Project } from '@/types'
import { firstLine } from './items'
import { taskCode } from './gitLink'
import { isMine } from './today'

export interface IcsEvent {
  uid: string
  /** YYYY-MM-DD */
  date: string
  summary: string
  description?: string
  /** Ultima modifica (ISO): DTSTAMP stabile. */
  stamp: string
}

/** Testo protetto per iCalendar: \ ; , e gli a capo. */
export const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Spezza una riga a 75 byte (UTF-8), continuando con uno spazio. */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length ? 74 : 75 // le righe di continuazione iniziano con uno spazio
    if (bytes + b > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.map((l, i) => (i ? ` ${l}` : l)).join('\r\n')
}

const stamp = (iso: string) => dayjs(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function buildIcs(calName: string, events: IcsEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Todo Doto//Scadenze//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(calName)}`]
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))) {
    const d = e.date.replace(/-/g, '')
    const next = dayjs(e.date).add(1, 'day').format('YYYYMMDD')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(e.stamp)}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

const taskEvent = (p: Pick<Project, 'id' | 'name'>, i: Item, withProject: boolean): IcsEvent => ({
  uid: `${i.id}@tododoto`,
  date: i.dueDate!,
  summary: `${withProject ? `[${p.name}] ` : ''}${i.seq ? `${taskCode(i.seq)} ` : ''}${firstLine(i.title)}`,
  description: i.notes.trim() ? i.notes.trim().slice(0, 500) : undefined,
  stamp: i.updatedAt ?? i.createdAt,
})

/** Eventi di un progetto: scadenze dei task da fare e date obiettivo delle tappe aperte. */
export function projectEvents(p: Project, opts: { withProject?: boolean; milestoneLabel: (name: string) => string; only?: (i: Item) => boolean }): IcsEvent[] {
  const out: IcsEvent[] = []
  for (const i of p.items) if (i.bucket === 'todo' && i.dueDate && (!opts.only || opts.only(i))) out.push(taskEvent(p, i, !!opts.withProject))
  for (const ms of p.milestones)
    if (!ms.closedAt && ms.dueDate)
      out.push({ uid: `${ms.id}@tododoto`, date: ms.dueDate, summary: `${opts.withProject ? `[${p.name}] ` : ''}${opts.milestoneLabel(ms.name)}`, stamp: ms.createdAt || p.updatedAt })
  return out
}

/** Calendario personale: le scadenze dei «miei» task (come nella vista Oggi) in tutti i progetti. */
export function personalEvents(projects: Project[], meId: string, local: boolean, milestoneLabel: (name: string) => string): IcsEvent[] {
  return projects
    .filter((p) => !p.trashedAt)
    .flatMap((p) => projectEvents(p, { withProject: true, milestoneLabel, only: (i) => isMine(i, { meId, local }) }).filter((e) => !e.uid.startsWith('mst_')))
}

/** Nome di file sicuro (senza accenti né caratteri speciali). */
export const icsFileName = (s: string) =>
  `${
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'calendario'
  }.ics`
