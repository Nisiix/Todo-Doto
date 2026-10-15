/**
 * Import di elementi da CSV (Excel, il nostro export, altri strumenti) e da
 * un'esportazione JSON di una bacheca Trello. Funzioni pure, testate in
 * import.test.ts; la scrittura nel workspace è nello store (`importItems`).
 */
import { PRIORITY_LABEL, STATUS_LABEL, type Bucket, type Priority, type Status } from '@/types'
import { t } from '@/i18n'

export interface ImportedItem {
  title: string
  notes: string
  priority: Priority
  status: Status
  dueDate: string | null
  label: string | null
  bucket: Bucket
}

export interface ImportResult {
  source: 'csv' | 'trello'
  items: ImportedItem[]
  /** Etichette citate dagli elementi, con un colore proposto. */
  labels: { name: string; color: string }[]
  /** Nome della bacheca (Trello) o del file. */
  name: string | null
  warnings: string[]
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Separatore più frequente nella prima riga fra ; , e tab. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (d: string) => first.split(d).length - 1
  return [';', ',', '\t'].reduce((best, d) => (count(d) > count(best) ? d : best), ';')
}

/** Parser CSV con virgolette (RFC 4180): righe come array di celle. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const COLUMNS: Record<keyof ImportedItem | 'completedAt', string[]> = {
  title: ['titolo', 'title', 'nome', 'name', 'oggetto', 'subject', 'attivita', 'task', 'elemento', 'summary'],
  notes: ['descrizione', 'description', 'note', 'notes', 'dettagli', 'details', 'desc'],
  priority: ['priorita', 'priority', 'prio'],
  status: ['stato', 'status'],
  dueDate: ['scadenza', 'due', 'due date', 'data scadenza', 'deadline', 'data'],
  label: ['etichetta', 'label', 'tag', 'tags', 'categoria', 'category', 'labels'],
  bucket: ['contenitore', 'bucket', 'lista', 'list', 'colonna', 'column'],
  completedAt: ['completato il', 'completed', 'completed at', 'done at', 'completato'],
}

function findColumn(headers: string[], key: keyof typeof COLUMNS): number {
  const names = COLUMNS[key]
  const h = headers.map(norm)
  let idx = h.findIndex((x) => names.includes(x))
  if (idx < 0) idx = h.findIndex((x) => names.some((n) => x.startsWith(n)))
  return idx
}

export function parsePriority(raw: string | undefined): Priority {
  const v = norm(raw ?? '')
  if (/^(immediata|immediate|urgente|urgent|critica|critical|highest|4|p0|p1)$/.test(v)) return 'immediata'
  if (/^(alta|high|importante|3|p2)$/.test(v)) return 'alta'
  if (/^(bassa|low|lowest|minor|1|p4)$/.test(v)) return 'bassa'
  return 'media'
}

export function parseStatus(raw: string | undefined): Status {
  const v = norm(raw ?? '')
  if (/^(confermato|confirmed|approvato|approved|ok|in corso|in progress|doing)$/.test(v)) return 'confermato'
  if (/^(da definire|to define|to do|todo|planned|pianificato)$/.test(v)) return 'da_definire'
  return 'da_valutare'
}

/** Accetta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY e ISO con ora. */
export function parseDate(raw: string | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return null
}

export function parseBucket(raw: string | undefined, completed: string | undefined): Bucket {
  const v = norm(raw ?? '')
  if (/cestin|trash|archiv|eliminat|deleted/.test(v)) return 'trash'
  if (/complet|done|fatt|chius|closed|finit/.test(v)) return 'done'
  if ((completed ?? '').trim()) return 'done'
  return 'todo'
}

const PALETTE = ['#d64545', '#9b7bd6', '#3f9a6a', '#2a95d2', '#d9a441', '#e07a3f', '#7fa98f', '#8a8e98']
function proposeLabels(names: Iterable<string>, colorOf: (n: string) => string | null = () => null) {
  const out: { name: string; color: string }[] = []
  for (const n of new Set(names)) {
    if (!n) continue
    out.push({ name: n, color: colorOf(n) ?? PALETTE[out.length % PALETTE.length]! })
  }
  return out
}

export function importFromCsv(text: string, fileName: string | null = null): ImportResult {
  const rows = parseCsv(text)
  const warnings: string[] = []
  if (rows.length === 0) return { source: 'csv', items: [], labels: [], name: fileName, warnings: [t('Il file è vuoto.')] }
  const headers = rows[0]!
  const col = {
    title: findColumn(headers, 'title'),
    notes: findColumn(headers, 'notes'),
    priority: findColumn(headers, 'priority'),
    status: findColumn(headers, 'status'),
    dueDate: findColumn(headers, 'dueDate'),
    label: findColumn(headers, 'label'),
    bucket: findColumn(headers, 'bucket'),
    completedAt: findColumn(headers, 'completedAt'),
  }
  // Senza intestazione riconoscibile: la prima colonna è il titolo, dalla prima riga
  const hasHeader = col.title >= 0
  if (!hasHeader) {
    col.title = 0
    warnings.push(t('Nessuna colonna «Titolo» riconosciuta: uso la prima colonna, dalla prima riga.'))
  }
  const body = hasHeader ? rows.slice(1) : rows
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '')
  const items: ImportedItem[] = []
  for (const r of body) {
    const title = cell(r, col.title).trim()
    if (!title) continue
    const dueRaw = cell(r, col.dueDate)
    const dueDate = parseDate(dueRaw)
    if (dueRaw.trim() && !dueDate) warnings.push(t('Data non riconosciuta per «{title}»: {value}', { title, value: dueRaw.trim() }))
    items.push({
      title,
      notes: cell(r, col.notes).trim(),
      priority: parsePriority(cell(r, col.priority)),
      status: parseStatus(cell(r, col.status)),
      dueDate,
      label: cell(r, col.label).trim() || null,
      bucket: parseBucket(cell(r, col.bucket), cell(r, col.completedAt)),
    })
  }
  return { source: 'csv', items, labels: proposeLabels(items.map((i) => i.label ?? '')), name: fileName, warnings }
}

// ---------------------------------------------------------------------------
// Trello (Menu → Altro → Stampa ed esporta → Esporta come JSON)
// ---------------------------------------------------------------------------

interface TrelloBoard {
  name?: string
  lists?: { id: string; name: string; closed?: boolean }[]
  cards?: {
    name: string
    desc?: string
    due?: string | null
    dueComplete?: boolean
    closed?: boolean
    idList: string
    labels?: { name?: string; color?: string | null }[]
  }[]
}

const TRELLO_COLORS: Record<string, string> = {
  green: '#3f9a6a',
  yellow: '#d9a441',
  orange: '#e07a3f',
  red: '#d64545',
  purple: '#9b7bd6',
  blue: '#2a95d2',
  sky: '#6cc3f0',
  lime: '#7fa98f',
  pink: '#e46262',
  black: '#1c1f26',
}

export const isTrelloExport = (data: unknown): data is TrelloBoard =>
  !!data && typeof data === 'object' && Array.isArray((data as TrelloBoard).cards) && Array.isArray((data as TrelloBoard).lists)

export function importFromTrello(data: unknown): ImportResult {
  if (!isTrelloExport(data)) return { source: 'trello', items: [], labels: [], name: null, warnings: [t('Il file non è un’esportazione JSON di Trello.')] }
  const lists = new Map((data.lists ?? []).map((l) => [l.id, l]))
  const colorOf = new Map<string, string>()
  const items: ImportedItem[] = []
  for (const c of data.cards ?? []) {
    const list = lists.get(c.idList)
    const listName = list?.name ?? ''
    const label = c.labels?.find((l) => l.name)?.name ?? null
    for (const l of c.labels ?? []) if (l.name && l.color && TRELLO_COLORS[l.color]) colorOf.set(l.name, TRELLO_COLORS[l.color]!)
    const labelNames = (c.labels ?? []).map((l) => norm(l.name ?? ''))
    const priority: Priority = labelNames.some((n) => /urgent|immediat|critic/.test(n))
      ? 'immediata'
      : labelNames.some((n) => /alta|high|important/.test(n))
        ? 'alta'
        : labelNames.some((n) => /bassa|low/.test(n))
          ? 'bassa'
          : 'media'
    items.push({
      title: c.name.trim(),
      notes: (c.desc ?? '').trim(),
      priority,
      status: /in corso|doing|in progress/i.test(listName) ? 'confermato' : 'da_valutare',
      dueDate: parseDate(c.due ?? undefined),
      label,
      bucket: c.closed || list?.closed ? 'trash' : c.dueComplete || /done|fatt|complet|chius|closed/i.test(listName) ? 'done' : 'todo',
    })
  }
  return {
    source: 'trello',
    items,
    labels: proposeLabels(items.map((i) => i.label ?? ''), (n) => colorOf.get(n) ?? null),
    name: data.name ?? null,
    warnings: [],
  }
}

/** Riconosce il formato dal contenuto e importa. */
export function importAny(text: string, fileName: string | null = null): ImportResult {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return importFromTrello(JSON.parse(trimmed))
    } catch {
      return { source: 'trello', items: [], labels: [], name: fileName, warnings: [t('Il file JSON non è leggibile.')] }
    }
  }
  return importFromCsv(text, fileName)
}

/** Testo di riepilogo per l'anteprima. */
export function summarize(r: ImportResult): string {
  const by = { todo: 0, done: 0, trash: 0 }
  for (const i of r.items) by[i.bucket]++
  const parts = [t('{n} da fare', { n: by.todo })]
  if (by.done) parts.push(t('{n} completati', { n: by.done }))
  if (by.trash) parts.push(t('{n} nel cestino', { n: by.trash }))
  const withDue = r.items.filter((i) => i.dueDate).length
  if (withDue) parts.push(t('{n} con scadenza', { n: withDue }))
  return parts.join(' · ')
}

export const PRIORITY_NAMES = Object.values(PRIORITY_LABEL)
export const STATUS_NAMES = Object.values(STATUS_LABEL)
