/**
 * Inserimento rapido: dal testo di un nuovo task si ricavano priorità,
 * assegnatario, etichetta e scadenza, in modo deterministico (senza IA).
 *
 *   Esportazione CSV !alta @mario #bug entro venerdì
 *
 *  - `!alta` `!immediata` `!1`…`!4`    priorità (anche in inglese: !high, !urgent…)
 *  - `@mario`                          assegnatario (nome utente, nome visualizzato o suo primo nome; `@io`/`@me` = me)
 *  - `#bug`                            etichetta (nome senza spazi, anche solo l'inizio se non è ambiguo)
 *  - `entro venerdì`, `per domani`, `^15/11`, `tra 3 giorni`, `by friday`…   scadenza
 *
 * Una data si riconosce solo dopo un indicatore (entro, per, scade, by, due,
 * ^) oppure nella forma «tra N giorni»: così «Report di oggi» resta un titolo.
 * Una scadenza porta lo stato a Confermato, l'unico che la ammette.
 * Ciò che non si riconosce (utente o etichetta inesistente, ambigua) resta nel
 * titolo così com'è. Funzioni pure: nessuna dipendenza da Vue o dallo store.
 */
import dayjs from 'dayjs'
import type { Label, Priority, User } from '@/types'

export type QuickTokenKind = 'priority' | 'assignee' | 'label' | 'due'

export interface QuickToken {
  kind: QuickTokenKind
  /** Valore riconosciuto: priorità, id utente, id etichetta o data YYYY-MM-DD. */
  value: string
  /** Posizione nel testo originale (per toglierlo dal titolo o dal campo). */
  start: number
  end: number
}

export interface QuickAddResult {
  /** Titolo senza i comandi riconosciuti. */
  title: string
  priority: Priority | null
  assigneeId: string | null
  labelId: string | null
  dueDate: string | null
  tokens: QuickToken[]
}

export interface QuickAddContext {
  users: Pick<User, 'id' | 'username' | 'displayName'>[]
  labels: Pick<Label, 'id' | 'name'>[]
  /** Utente corrente, per `@io` / `@me`. */
  meId?: string | null
  /** Oggi, YYYY-MM-DD. */
  today: string
  /** Ordine delle date numeriche senza anno: giorno/mese (it) o mese/giorno (en). */
  dayFirst?: boolean
  /** Espressioni da lasciare nel titolo (scelte dall'utente), confrontate senza maiuscole. */
  ignore?: string[]
}

/** Minuscole senza accenti né spazi: «Venerdì» → «venerdi», «Mario Rossi» → «mariorossi». */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')

const PRIORITY_WORDS: Record<string, Priority> = {
  bassa: 'bassa', low: 'bassa', '4': 'bassa',
  media: 'media', normale: 'media', medium: 'media', normal: 'media', '3': 'media',
  alta: 'alta', high: 'alta', '2': 'alta',
  immediata: 'immediata', urgente: 'immediata', subito: 'immediata', urgent: 'immediata', critical: 'immediata', '1': 'immediata',
}

const WEEKDAYS: Record<string, number> = {
  domenica: 0, dom: 0, sunday: 0, sun: 0,
  lunedi: 1, lun: 1, monday: 1, mon: 1,
  martedi: 2, mar: 2, tuesday: 2, tue: 2,
  mercoledi: 3, mer: 3, wednesday: 3, wed: 3,
  giovedi: 4, gio: 4, thursday: 4, thu: 4,
  venerdi: 5, ven: 5, friday: 5, fri: 5,
  sabato: 6, sab: 6, saturday: 6, sat: 6,
}

const MONTHS: Record<string, number> = {
  gennaio: 1, gen: 1, january: 1, jan: 1,
  febbraio: 2, feb: 2, february: 2,
  marzo: 3, march: 3,
  aprile: 4, apr: 4, april: 4,
  maggio: 5, mag: 5, may: 5,
  giugno: 6, giu: 6, june: 6, jun: 6,
  luglio: 7, lug: 7, july: 7, jul: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  settembre: 9, set: 9, september: 9, sep: 9, sept: 9,
  ottobre: 10, ott: 10, october: 10, oct: 10,
  novembre: 11, nov: 11, november: 11,
  dicembre: 12, dic: 12, december: 12, dec: 12,
}

const UNIT: Record<string, 'day' | 'week' | 'month'> = {
  giorno: 'day', giorni: 'day', day: 'day', days: 'day',
  settimana: 'week', settimane: 'week', week: 'week', weeks: 'week',
  mese: 'month', mesi: 'month', month: 'month', months: 'month',
}

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')

/** Data valida o null (dayjs accetta il 31/02 spostandolo: qui no). */
function ymd(y: number, mo: number, d: number): dayjs.Dayjs | null {
  const x = dayjs(new Date(y, mo - 1, d))
  return x.isValid() && x.date() === d && x.month() === mo - 1 ? x : null
}

/** Giorno e mese senza anno: quest'anno, o il prossimo se è già passato. */
function upcoming(today: dayjs.Dayjs, mo: number, d: number): dayjs.Dayjs | null {
  const x = ymd(today.year(), mo, d)
  if (!x) return null
  return x.isBefore(today, 'day') ? ymd(today.year() + 1, mo, d) : x
}

/**
 * Traduce un'espressione di data (già senza indicatore) in YYYY-MM-DD, o null.
 * I giorni della settimana indicano il prossimo, mai oggi: «venerdì» detto di
 * venerdì è quello della settimana dopo.
 */
export function parseDateExpr(expr: string, todayKey: string, dayFirst = true): string | null {
  const today = dayjs(todayKey)
  const e = expr
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
  if (e === 'oggi' || e === 'today') return fmt(today)
  if (e === 'domani' || e === 'tomorrow') return fmt(today.add(1, 'day'))
  if (e === 'dopodomani') return fmt(today.add(2, 'day'))
  if (e === 'fine settimana' || e === 'end of week' || e === 'eow') {
    const fri = today.add((5 - today.day() + 7) % 7, 'day')
    return fmt(fri)
  }
  if (e === 'fine mese' || e === 'end of month' || e === 'eom') return fmt(today.endOf('month'))
  if (e === 'prossima settimana' || e === 'settimana prossima' || e === 'next week') return fmt(today.add(((1 - today.day() + 7) % 7) || 7, 'day'))
  if (e in WEEKDAYS) {
    const diff = ((WEEKDAYS[e]! - today.day() + 7) % 7) || 7
    return fmt(today.add(diff, 'day'))
  }
  let r = /^(?:(?:tra|fra|in) )?(\d{1,3}) ([a-z]+)$/.exec(e)
  if (r && UNIT[r[2]!]) return fmt(today.add(Number(r[1]), UNIT[r[2]!]!))
  // 2026-11-15
  r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(e)
  if (r) {
    const x = ymd(Number(r[1]), Number(r[2]), Number(r[3]))
    return x ? fmt(x) : null
  }
  // 15/11, 15/11/26, 15.11.2026 (11/15 in inglese)
  r = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(e)
  if (r) {
    const a = Number(r[1])
    const b = Number(r[2])
    const [d, mo] = dayFirst ? [a, b] : [b, a]
    if (r[3]) {
      const y = r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3])
      const x = ymd(y, mo, d)
      return x ? fmt(x) : null
    }
    const x = upcoming(today, mo, d)
    return x ? fmt(x) : null
  }
  // 15 novembre, 15 nov 2026, nov 15
  r = /^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/.exec(e) ?? null
  let d: number | undefined
  let mo: number | undefined
  let y: number | undefined
  if (r && MONTHS[r[2]!]) [d, mo, y] = [Number(r[1]), MONTHS[r[2]!], r[3] ? Number(r[3]) : undefined]
  else {
    const s = /^([a-z]+) (\d{1,2})(?:,? (\d{4}))?$/.exec(e)
    if (s && MONTHS[s[1]!]) [d, mo, y] = [Number(s[2]), MONTHS[s[1]!], s[3] ? Number(s[3]) : undefined]
  }
  if (d && mo) {
    const x = y ? ymd(y, mo, d) : upcoming(today, mo, d)
    return x ? fmt(x) : null
  }
  return null
}

// Espressioni di data che possono seguire un indicatore (dalla più lunga alla più corta)
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const WEEKDAY_NAMES = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')
const UNITS = Object.keys(UNIT).sort((a, b) => b.length - a.length).join('|')
const DATE_EXPR = [
  `\\d{4}-\\d{1,2}-\\d{1,2}`,
  `\\d{1,2}[/.-]\\d{1,2}(?:[/.-](?:\\d{4}|\\d{2}))?`,
  `\\d{1,2} (?:${MONTH_NAMES})(?: \\d{4})?`,
  `(?:${MONTH_NAMES}) \\d{1,2}(?:,? \\d{4})?`,
  `(?:tra|fra|in) \\d{1,3} (?:${UNITS})`,
  `fine settimana|fine mese|prossima settimana|settimana prossima|end of week|end of month|next week|eow|eom`,
  `dopodomani|oggi|domani|today|tomorrow`,
  `${WEEKDAY_NAMES}`,
].join('|')
const MARKERS = 'entro(?: il| la)?|per(?: il| la)?|scade(?: il)?|scadenza|by(?: the)?|due(?: on)?'
const END = `(?=$|[\\s.,;:!?)])`
/** Data dopo un indicatore: «entro venerdì», «^15/11». */
const DUE_RE = new RegExp(`(^|\\s)(?:\\^|(?:${MARKERS}) )(${DATE_EXPR})${END}`, 'giu')
/** Scadenza relativa senza indicatore: «tra 3 giorni», «in 2 weeks». */
const REL_RE = new RegExp(`(^|\\s)((?:tra|fra|in) \\d{1,3} (?:${UNITS}))${END}`, 'giu')
const PRIORITY_RE = /(^|\s)!([\p{L}\d]+)(?=$|[\s.,;:!?)])/gu
const MENTION_RE = /(^|\s)@([\p{L}\p{N}._-]+)(?=$|[\s,;:!?)])/gu
const LABEL_RE = /(^|\s)#([\p{L}\p{N}._/-]+)(?=$|[\s,;:!?)])/gu

/** L'unico elemento che soddisfa la prima regola con almeno un risultato; null se nessuno o più d'uno. */
function unique<T>(xs: T[], rules: ((x: T) => boolean)[]): T | null {
  for (const rule of rules) {
    const found = xs.filter(rule)
    if (found.length === 1) return found[0]!
    if (found.length > 1) return null
  }
  return null
}

function findUser(word: string, ctx: QuickAddContext): string | null {
  const w = fold(word)
  if ((w === 'io' || w === 'me') && ctx.meId) return ctx.meId
  const u = unique(ctx.users, [
    (u) => fold(u.username) === w,
    (u) => fold(u.displayName) === w,
    (u) => fold(u.displayName.split(/\s+/)[0] ?? '') === w,
    (u) => w.length >= 2 && (fold(u.displayName).startsWith(w) || fold(u.username).startsWith(w)),
  ])
  return u?.id ?? null
}

function findLabel(word: string, ctx: QuickAddContext): string | null {
  const w = fold(word)
  const l = unique(ctx.labels, [(l) => fold(l.name) === w, (l) => w.length >= 2 && fold(l.name).startsWith(w)])
  return l?.id ?? null
}

/**
 * Copia del testo senza accenti e della stessa lunghezza («venerdì» → «venerdi»):
 * le espressioni si cercano qui, le posizioni valgono anche per l'originale.
 */
const plain = (s: string) =>
  Array.from(s, (c) => {
    const b = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return b.length === c.length ? b : c
  }).join('')

/** Ricava i comandi dal testo. Per ogni tipo vale il primo riconosciuto; gli altri restano nel titolo. */
export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  const text = plain(input)
  const ignored = new Set((ctx.ignore ?? []).map((x) => x.toLowerCase()))
  const tokens: QuickToken[] = []
  const has = (k: QuickTokenKind) => tokens.some((t) => t.kind === k)
  const overlaps = (s: number, e: number) => tokens.some((t) => s < t.end && e > t.start)
  const scan = (re: RegExp, kind: QuickTokenKind, resolve: (m: RegExpExecArray) => string | null) => {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (has(kind)) break
      const start = m.index + m[1]!.length
      const end = m.index + m[0].length
      if (overlaps(start, end) || ignored.has(input.slice(start, end).toLowerCase())) continue
      const value = resolve(m)
      if (value) tokens.push({ kind, value, start, end })
    }
  }
  const dayFirst = ctx.dayFirst ?? true
  scan(DUE_RE, 'due', (m) => parseDateExpr(m[2]!, ctx.today, dayFirst))
  scan(REL_RE, 'due', (m) => parseDateExpr(m[2]!, ctx.today, dayFirst))
  scan(PRIORITY_RE, 'priority', (m) => PRIORITY_WORDS[fold(m[2]!)] ?? null)
  scan(MENTION_RE, 'assignee', (m) => findUser(m[2]!, ctx))
  scan(LABEL_RE, 'label', (m) => findLabel(m[2]!, ctx))
  tokens.sort((a, b) => a.start - b.start)
  const get = (k: QuickTokenKind) => tokens.find((t) => t.kind === k)?.value ?? null
  return {
    title: stripTokens(input, tokens),
    priority: (get('priority') as Priority | null) ?? null,
    assigneeId: get('assignee'),
    labelId: get('label'),
    dueDate: get('due'),
    tokens,
  }
}

/** Il testo del comando, così com'è scritto (per lasciarlo nel titolo con `ignore`). */
export const tokenText = (input: string, t: Pick<QuickToken, 'start' | 'end'>) => input.slice(t.start, t.end)

/** Il testo senza i comandi indicati, con gli spazi ricomposti. */
export function stripTokens(input: string, tokens: Pick<QuickToken, 'start' | 'end'>[]): string {
  let out = ''
  let at = 0
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    out += input.slice(at, t.start)
    at = t.end
  }
  out += input.slice(at)
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1') // spazio rimasto prima della punteggiatura
    .replace(/[,;:]+(?=[.,;:!?]|\s*$)/g, '') // virgole rimaste orfane: «fornitore,.» → «fornitore.»
    .trim()
}
