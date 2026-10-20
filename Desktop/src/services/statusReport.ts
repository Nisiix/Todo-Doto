/**
 * Rapporto di stato di un progetto per un periodo, per uso interno (al
 * contrario della roadmap per il cliente): completati e nuovi del periodo,
 * ritardi, prossime scadenze, tappe, decisioni, domande aperte, attenzioni e
 * tempi. In Markdown (da incollare) e come pagina HTML autonoma (da salvare,
 * stampare in PDF o mandare per email). Funzioni pure.
 */
import dayjs from 'dayjs'
import type { Item, Project, Question } from '@/types'
import { firstLine } from './items'
import { taskCode } from './gitLink'
import { projectDecisions, type DecisionEntry } from './decisions'
import { milestoneProgress, sortMilestones, type MilestoneProgress } from './milestones'
import { cycleStats, projectSignals, type CycleStats, type Signal } from './insights'
import type { WeekFacts } from './aiAssist'
import { DATE, defineMessages, localeTag, plural } from '@/i18n'

const m = defineMessages({
  it: {
    report: 'Rapporto di stato',
    period: (a: string, b: string) => `Dal ${a} al ${b}`,
    summary: (done: number, created: number, overdue: number) =>
      `${done} ${plural(done, 'completato', 'completati')} e ${created} ${plural(created, 'nuovo', 'nuovi')} nel periodo · ${overdue} in ritardo adesso`,
    completed: 'Completati nel periodo',
    created: 'Nuovi nel periodo',
    overdue: 'In ritardo',
    upcoming: 'In scadenza nei prossimi 14 giorni',
    milestones: 'Tappe',
    milestone: (name: string, p: MilestoneProgress, due: string | null) =>
      `${name}: ${p.done} di ${p.total} completati${due ? ` · entro il ${due}` : ''}${p.late ? ' · in ritardo' : ''}`,
    decisions: 'Decisioni prese nel periodo',
    why: 'Perché',
    questions: 'Domande aperte',
    waiting: (d: number) => `aspetta da ${d} ${plural(d, 'giorno', 'giorni')}`,
    attention: 'Attenzioni',
    signal: {
      overdue: 'in ritardo',
      urgent_unassigned: 'immediate senza nessuno',
      unanswered: 'domande senza risposta',
      removed_assignee: 'assegnati a utenti non più nel workspace',
      due_in_absence: 'in scadenza durante un’assenza',
      confirmed_no_due: 'confermati senza scadenza',
      stale: 'fermi da tre settimane',
    } as Record<Signal['kind'], string>,
    times: 'Tempi (mediane, ultimi 90 giorni)',
    toConfirm: 'da creato a confermato',
    confirmToDone: 'da confermato a completato',
    leadTime: 'da creato a completato',
    days: (d: number) => (d < 1 ? 'meno di 1 giorno' : `${Math.round(d)} ${plural(Math.round(d), 'giorno', 'giorni')}`),
    by: (n: string) => n,
    none: 'Niente.',
    footer: 'Documento generato con Todo Doto',
  },
  en: {
    report: 'Status report',
    period: (a: string, b: string) => `From ${a} to ${b}`,
    summary: (done: number, created: number, overdue: number) => `${done} completed and ${created} new in the period · ${overdue} overdue now`,
    completed: 'Completed in the period',
    created: 'New in the period',
    overdue: 'Overdue',
    upcoming: 'Due in the next 14 days',
    milestones: 'Milestones',
    milestone: (name: string, p: MilestoneProgress, due: string | null) =>
      `${name}: ${p.done} of ${p.total} completed${due ? ` · by ${due}` : ''}${p.late ? ' · late' : ''}`,
    decisions: 'Decisions taken in the period',
    why: 'Why',
    questions: 'Open questions',
    waiting: (d: number) => `waiting for ${d} ${plural(d, 'day', 'days')}`,
    attention: 'Attention',
    signal: {
      overdue: 'overdue',
      urgent_unassigned: 'urgent with nobody on them',
      unanswered: 'unanswered questions',
      removed_assignee: 'assigned to former members',
      due_in_absence: 'due during an absence',
      confirmed_no_due: 'confirmed without a due date',
      stale: 'stuck for three weeks',
    } as Record<Signal['kind'], string>,
    times: 'Times (medians, last 90 days)',
    toConfirm: 'created to confirmed',
    confirmToDone: 'confirmed to completed',
    leadTime: 'created to completed',
    days: (d: number) => (d < 1 ? 'under 1 day' : `${Math.round(d)} ${plural(Math.round(d), 'day', 'days')}`),
    by: (n: string) => n,
    none: 'Nothing.',
    footer: 'Document generated with Todo Doto',
  },
})

export interface ReportFacts {
  project: Pick<Project, 'id' | 'name'>
  from: string
  to: string
  completed: Item[]
  created: Item[]
  overdue: Item[]
  upcoming: Item[]
  milestones: { name: string; dueDate: string | null; progress: MilestoneProgress }[]
  decisions: DecisionEntry[]
  questions: { item: Item; question: Question; days: number }[]
  signals: { kind: Signal['kind']; n: number }[]
  times: CycleStats
}

/** I fatti del periodo [from, to] (YYYY-MM-DD, inclusi). `today` per ritardi e prossime scadenze. */
export function reportFacts(p: Project, from: string, to: string, today: string, opts: { userIds?: string[]; absences?: Record<string, { from: string; to: string }[]> } = {}): ReportFacts {
  const inPeriod = (iso: string | null | undefined) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to
  const live = p.items.filter((i) => i.bucket !== 'trash')
  const soon = dayjs(today).add(14, 'day').format('YYYY-MM-DD')
  const nowIso = `${today}T12:00:00.000Z`
  const byDue = (a: Item, b: Item) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  const signals = projectSignals(p, { now: nowIso, userIds: opts.userIds, absences: opts.absences })
  const counts = new Map<Signal['kind'], number>()
  for (const s of signals) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1)
  return {
    project: { id: p.id, name: p.name },
    from,
    to,
    completed: live.filter((i) => i.bucket === 'done' && inPeriod(i.completedAt)).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')),
    created: live.filter((i) => inPeriod(i.createdAt)),
    overdue: live.filter((i) => i.bucket === 'todo' && !!i.dueDate && i.dueDate < today).sort(byDue),
    upcoming: live.filter((i) => i.bucket === 'todo' && !!i.dueDate && i.dueDate >= today && i.dueDate <= soon).sort(byDue),
    milestones: sortMilestones(p.milestones)
      .filter((x) => !x.closedAt || inPeriod(x.closedAt))
      .map((x) => ({ name: x.name, dueDate: x.dueDate, progress: milestoneProgress(x, p.items, today) })),
    decisions: projectDecisions(p).filter((d) => inPeriod(d.decision.at)),
    questions: live
      .filter((i) => i.bucket === 'todo')
      .flatMap((item) => item.questions.filter((q) => !q.resolved).map((question) => ({ item, question, days: Math.floor((Date.parse(nowIso) - Date.parse(question.createdAt)) / 86_400_000) })))
      .sort((a, b) => b.days - a.days),
    signals: [...counts].map(([kind, n]) => ({ kind, n })),
    times: cycleStats(p.items, nowIso),
  }
}

export interface ReportContext {
  userName: (id: string | null | undefined) => string
}

const code = (i: Item) => (i.seq ? `${taskCode(i.seq)} ` : '')
const day = (d: string) => dayjs(d).format(DATE.dayMonth)
const who = (i: Item, ctx: ReportContext) => (i.assigneeId ? ` (${ctx.userName(i.assigneeId)})` : '')

/** Il rapporto in Markdown, da incollare in una mail, in Teams o in un documento. */
export function reportMarkdown(f: ReportFacts, ctx: ReportContext, intro = ''): string {
  const L: string[] = [`# ${m.report} · ${f.project.name}`, '', `_${m.period(dayjs(f.from).format(DATE.date), dayjs(f.to).format(DATE.date))}_`, '']
  if (intro.trim()) L.push(intro.trim(), '')
  L.push(m.summary(f.completed.length, f.created.length, f.overdue.length), '')
  const list = (title: string, xs: string[]) => {
    if (!xs.length) return
    L.push(`## ${title}`, '', ...xs.map((x) => `- ${x}`), '')
  }
  list(m.completed, f.completed.map((i) => `${code(i)}${firstLine(i.title)}${who(i, ctx)}`))
  list(m.overdue, f.overdue.map((i) => `${code(i)}${firstLine(i.title)} — ${day(i.dueDate!)}${who(i, ctx)}`))
  list(m.upcoming, f.upcoming.map((i) => `${code(i)}${firstLine(i.title)} — ${day(i.dueDate!)}${who(i, ctx)}`))
  list(m.milestones, f.milestones.map((x) => m.milestone(x.name, x.progress, x.dueDate ? day(x.dueDate) : null)))
  list(m.decisions, f.decisions.map((d) => `**${d.question.text.trim()}** → ${d.answer.text.trim()}${d.decision.rationale ? ` (${m.why}: ${d.decision.rationale})` : ''}`))
  list(m.questions, f.questions.map((q) => `${q.question.text.trim()} — ${code(q.item)}${firstLine(q.item.title)}, ${m.waiting(q.days)}`))
  list(m.attention, f.signals.map((s) => `${s.n} ${m.signal[s.kind]}`))
  list(m.created, f.created.map((i) => `${code(i)}${firstLine(i.title)}`))
  const t = f.times
  const times = [t.toConfirm !== null ? `${m.toConfirm}: ${m.days(t.toConfirm)}` : '', t.confirmToDone !== null ? `${m.confirmToDone}: ${m.days(t.confirmToDone)}` : '', t.leadTime !== null ? `${m.leadTime}: ${m.days(t.leadTime)}` : ''].filter(Boolean)
  list(m.times, times)
  return L.join('\n').trimEnd() + '\n'
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Pagina HTML autonoma (stili inclusi, nessuno script né risorsa esterna). */
export function buildReportHtml(f: ReportFacts, ctx: ReportContext, intro = ''): string {
  const sec = (title: string, rows: string[], cls = '') => (rows.length ? `<section class="${cls}"><h2>${esc(title)}</h2><ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul></section>` : '')
  const task = (i: Item, extra = '') =>
    `<span class="code">${esc(code(i).trim())}</span> ${esc(firstLine(i.title))}${i.assigneeId ? ` <span class="meta">${esc(ctx.userName(i.assigneeId))}</span>` : ''}${extra}`
  const date = (d: string) => `<span class="date">${esc(day(d))}</span>`
  const t = f.times
  const times = [
    t.toConfirm !== null ? `${esc(m.toConfirm)}: <b>${esc(m.days(t.toConfirm))}</b>` : '',
    t.confirmToDone !== null ? `${esc(m.confirmToDone)}: <b>${esc(m.days(t.confirmToDone))}</b>` : '',
    t.leadTime !== null ? `${esc(m.leadTime)}: <b>${esc(m.days(t.leadTime))}</b>` : '',
  ].filter(Boolean)
  return `<!doctype html>
<html lang="${localeTag.slice(0, 2)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.report)} · ${esc(f.project.name)}</title>
<style>
:root{--ink:#1d1b22;--ink2:#55505f;--ink3:#8a8494;--line:#e6e2ea;--accent:#2a95d2;--bad:#c23b3b;--ok:#3f9a6a}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:44px 28px 60px}
.kicker{margin:0;color:var(--accent);font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
h1{margin:4px 0 2px;font-size:28px;line-height:1.2}
.period{margin:0;color:var(--ink3);font-size:13px}
.intro{margin:18px 0 0;color:var(--ink2)}
.summary{margin:18px 0 0;font-weight:600}
section{margin-top:30px}
h2{margin:0;font-size:17px;border-bottom:2px solid var(--ink);padding-bottom:5px}
ul{list-style:none;margin:6px 0 0;padding:0}
li{padding:7px 0;border-bottom:1px solid var(--line);break-inside:avoid}
.code{font:12px ui-monospace,Consolas,monospace;color:var(--ink3)}
.meta,.date{color:var(--ink3);font-size:12.5px}
.date{float:right;font-variant-numeric:tabular-nums}
.bad .date,.bad h2{color:var(--bad)}
.why{display:block;color:var(--ink2);font-size:13px}
footer{margin-top:44px;color:var(--ink3);font-size:12px}
@media print{main{padding:0}@page{size:A4;margin:18mm 16mm}h2{break-after:avoid}}
</style>
</head>
<body>
<main>
<p class="kicker">${esc(m.report)}</p>
<h1>${esc(f.project.name)}</h1>
<p class="period">${esc(m.period(dayjs(f.from).format(DATE.date), dayjs(f.to).format(DATE.date)))}</p>
${intro.trim() ? `<p class="intro">${esc(intro.trim()).replace(/\n/g, '<br>')}</p>` : ''}
<p class="summary">${esc(m.summary(f.completed.length, f.created.length, f.overdue.length))}</p>
${sec(m.completed, f.completed.map((i) => task(i, i.completedAt ? date(i.completedAt) : '')))}
${sec(m.overdue, f.overdue.map((i) => task(i, date(i.dueDate!))), 'bad')}
${sec(m.upcoming, f.upcoming.map((i) => task(i, date(i.dueDate!))))}
${sec(m.milestones, f.milestones.map((x) => esc(m.milestone(x.name, x.progress, x.dueDate ? day(x.dueDate) : null))))}
${sec(m.decisions, f.decisions.map((d) => `<b>${esc(d.question.text.trim())}</b> → ${esc(d.answer.text.trim())}${d.decision.rationale ? `<span class="why">${esc(m.why)}: ${esc(d.decision.rationale)}</span>` : ''}`))}
${sec(m.questions, f.questions.map((q) => `${esc(q.question.text.trim())} <span class="meta">${esc(code(q.item))}${esc(firstLine(q.item.title))} · ${esc(m.waiting(q.days))}</span>`))}
${sec(m.attention, f.signals.map((s) => `${s.n} ${esc(m.signal[s.kind])}`))}
${sec(m.created, f.created.map((i) => task(i)))}
${sec(m.times, times)}
<footer>${esc(m.footer)}</footer>
</main>
</body>
</html>
`
}

/** I fatti nel formato del riepilogo con l'IA locale (per un'introduzione scritta dal modello). */
export function toWeekFacts(f: ReportFacts): WeekFacts {
  const t = (i: Item) => ({ project: f.project.name, title: firstLine(i.title) })
  return {
    completed: f.completed.map(t),
    created: f.created.map(t),
    overdue: f.overdue.map((i) => ({ ...t(i), due: i.dueDate! })),
    upcoming: f.upcoming.map((i) => ({ ...t(i), due: i.dueDate! })),
  }
}
