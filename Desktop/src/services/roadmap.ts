/**
 * «Roadmap per il cliente»: una pagina HTML autonoma (stili inclusi, nessuno
 * script, nessuna risorsa esterna) con lo stato di un progetto, da mandare al
 * cliente o stampare in PDF.
 *
 * Contiene solo ciò che si sceglie di mostrare e mai i dettagli interni: dei
 * task si usa la prima riga del titolo, l'etichetta e le date; niente
 * descrizioni, commenti, domande, allegati, priorità, stack o percorsi.
 * Le idee «da valutare» restano fuori se non si chiede di includerle.
 */
import dayjs from 'dayjs'
import type { Item, Label, Project } from '@/types'
import { firstLine } from './items'
import { DATE, compareText, defineMessages, localeTag, plural } from '@/i18n'

const m = defineMessages({
  it: {
    roadmap: 'Roadmap',
    updated: (d: string) => `Aggiornata al ${d}`,
    progress: (done: number, total: number) => `${done} di ${total} ${plural(total, 'attività completata', 'attività completate')}`,
    planned: 'Pianificato',
    plannedHint: 'Le prossime attività con la data prevista.',
    undated: 'Da pianificare',
    undatedHint: 'Attività previste, la data è ancora da fissare.',
    done: 'Completato',
    doneSince: (d: string) => `Dal ${d}.`,
    toDefine: 'da definire',
    nothingPlanned: 'Nessuna attività pianificata al momento.',
    by: (n: string) => `a cura di ${n}`,
    footer: 'Documento generato con Todo Doto',
    legend: 'Aree',
  },
  en: {
    roadmap: 'Roadmap',
    updated: (d: string) => `Updated on ${d}`,
    progress: (done: number, total: number) => `${done} of ${total} ${plural(total, 'task completed', 'tasks completed')}`,
    planned: 'Planned',
    plannedHint: 'Upcoming work with its expected date.',
    undated: 'To be scheduled',
    undatedHint: 'Planned work whose date is still to be set.',
    done: 'Completed',
    doneSince: (d: string) => `Since ${d}.`,
    toDefine: 'to be defined',
    nothingPlanned: 'Nothing scheduled at the moment.',
    by: (n: string) => `by ${n}`,
    footer: 'Document generated with Todo Doto',
    legend: 'Areas',
  },
})

export interface RoadmapOptions {
  /** Titolo in testa (predefinito: nome del progetto). */
  title: string
  /** Testo introduttivo (predefinito: descrizione del progetto). */
  intro: string
  /** Mostra i completati; `doneSinceDays` limita agli ultimi N giorni (null = tutti). */
  showDone: boolean
  doneSinceDays: number | null
  /** Mostra le attività senza data. */
  showUndated: boolean
  /** Mostra a chi è assegnata ogni attività. */
  showAssignees: boolean
  /** Include le idee «da valutare» (di solito sono interne). */
  includeTriage: boolean
  /** Solo le attività con queste etichette (vuoto = tutte). */
  labelIds: string[]
}

export function defaultRoadmapOptions(p: Project): RoadmapOptions {
  return { title: p.name, intro: p.description, showDone: true, doneSinceDays: 90, showUndated: true, showAssignees: false, includeTriage: false, labelIds: [] }
}

export interface RoadmapContext {
  labels: Record<string, Label>
  userName: (id: string) => string
  now?: dayjs.Dayjs
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** Solo colori esadecimali: un colore manomesso non entra nel CSS. */
const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#9b7bd6')

/** Le attività che entrano nella roadmap, già divise nelle tre sezioni. */
export function roadmapSections(p: Project, o: RoadmapOptions, now = dayjs()) {
  const wanted = (i: Item) =>
    (o.includeTriage || i.status !== 'da_valutare') && (!o.labelIds.length || (i.labelId !== null && o.labelIds.includes(i.labelId)))
  const todo = p.items.filter((i) => i.bucket === 'todo' && wanted(i))
  const doneAll = p.items.filter((i) => i.bucket === 'done' && wanted(i))
  const since = o.doneSinceDays === null ? null : now.subtract(o.doneSinceDays, 'day')
  const done = o.showDone
    ? doneAll.filter((i) => !since || dayjs(i.completedAt ?? i.createdAt).isAfter(since)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    : []
  const planned = todo.filter((i) => i.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || compareText(a.title, b.title))
  const undated = o.showUndated ? todo.filter((i) => !i.dueDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []
  return { planned, undated, done, total: todo.length + doneAll.length, completed: doneAll.length, since }
}

export function buildRoadmapHtml(p: Project, o: RoadmapOptions, ctx: RoadmapContext): string {
  const now = ctx.now ?? dayjs()
  const s = roadmapSections(p, o, now)
  const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0
  const usedLabels = new Map<string, Label>()
  for (const i of [...s.planned, ...s.undated, ...s.done]) if (i.labelId && ctx.labels[i.labelId]) usedLabels.set(i.labelId, ctx.labels[i.labelId]!)

  const chip = (i: Item) => {
    const l = i.labelId ? ctx.labels[i.labelId] : null
    return l ? `<span class="chip"><i style="background:${safeColor(l.color)}"></i>${esc(l.name)}</span>` : ''
  }
  const meta = (i: Item) => {
    const bits: string[] = []
    if (i.status === 'da_definire') bits.push(esc(m.toDefine))
    if (o.showAssignees && i.assigneeId) bits.push(esc(m.by(ctx.userName(i.assigneeId))))
    return bits.length ? `<span class="meta">${bits.join(' · ')}</span>` : ''
  }
  const row = (i: Item, date: string | null, cls = '') =>
    `<li class="${cls}"><span class="date">${date ? esc(date) : ''}</span><span class="what">${esc(firstLine(i.title))}${meta(i)}</span>${chip(i)}</li>`

  // Pianificato, a gruppi per mese
  const months = new Map<string, Item[]>()
  for (const i of s.planned) {
    const k = i.dueDate!.slice(0, 7)
    months.set(k, [...(months.get(k) ?? []), i])
  }
  const monthName = (k: string) => {
    const t = new Date(`${k}-01T12:00:00`).toLocaleDateString(localeTag, { month: 'long', year: 'numeric' })
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const planned = s.planned.length
    ? [...months]
        .map(([k, items]) => `<h3>${esc(monthName(k))}</h3><ul>${items.map((i) => row(i, dayjs(i.dueDate).format(DATE.dayMonth))).join('')}</ul>`)
        .join('')
    : `<p class="empty">${esc(m.nothingPlanned)}</p>`
  const undated = s.undated.length ? `<section><h2>${esc(m.undated)}</h2><p class="hint">${esc(m.undatedHint)}</p><ul>${s.undated.map((i) => row(i, null)).join('')}</ul></section>` : ''
  const done = o.showDone && s.done.length
    ? `<section><h2>${esc(m.done)}</h2>${s.since ? `<p class="hint">${esc(m.doneSince(s.since.format(DATE.date)))}</p>` : ''}<ul>${s.done
        .map((i) => row(i, i.completedAt ? dayjs(i.completedAt).format(DATE.dayMonth) : null, 'done'))
        .join('')}</ul></section>`
    : ''
  const legend = usedLabels.size
    ? `<p class="legend"><span>${esc(m.legend)}:</span> ${[...usedLabels.values()].map((l) => `<span class="chip"><i style="background:${safeColor(l.color)}"></i>${esc(l.name)}</span>`).join(' ')}</p>`
    : ''
  const intro = o.intro.trim() ? `<p class="intro">${esc(o.intro.trim()).replace(/\n/g, '<br>')}</p>` : ''
  const title = o.title.trim() || p.name

  return `<!doctype html>
<html lang="${localeTag.slice(0, 2)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(m.roadmap)}</title>
<style>
:root{--ink:#1d1b22;--ink2:#55505f;--ink3:#8a8494;--line:#e6e2ea;--accent:#6b4fbf;--ok:#3f9a6a;--bg:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:48px 28px 64px}
.kicker{margin:0;color:var(--accent);font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
h1{margin:4px 0 2px;font-size:30px;line-height:1.2;letter-spacing:-.01em}
.updated{margin:0;color:var(--ink3);font-size:13px}
.intro{margin:18px 0 0;color:var(--ink2)}
.progress{margin:26px 0 8px;display:flex;align-items:center;gap:14px}
.bar{flex:1;height:10px;border-radius:99px;background:var(--line);overflow:hidden}
.bar>i{display:block;height:100%;background:var(--ok);border-radius:99px}
.progress b{font-size:20px;font-variant-numeric:tabular-nums}
.progress-text{margin:0;color:var(--ink2);font-size:13px}
.legend{margin:14px 0 0;color:var(--ink3);font-size:12.5px}
section{margin-top:38px}
h2{margin:0;font-size:19px;letter-spacing:-.005em;border-bottom:2px solid var(--ink);padding-bottom:6px}
h3{margin:20px 0 4px;font-size:13px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.hint{margin:6px 0 0;color:var(--ink3);font-size:13px}
ul{list-style:none;margin:6px 0 0;padding:0}
li{display:flex;align-items:baseline;gap:14px;padding:9px 0;border-bottom:1px solid var(--line);break-inside:avoid}
.date{flex:0 0 64px;color:var(--ink2);font-size:13px;font-variant-numeric:tabular-nums}
.what{flex:1;min-width:0}
.meta{display:block;color:var(--ink3);font-size:12.5px}
li.done .what{color:var(--ink2)}
li.done .date::before{content:"✓ ";color:var(--ok);font-weight:700}
.chip{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;color:var(--ink2);border:1px solid var(--line);border-radius:99px;padding:1px 9px}
.chip i{width:8px;height:8px;border-radius:50%}
.empty{color:var(--ink3)}
footer{margin-top:48px;color:var(--ink3);font-size:12px}
@media print{main{padding:0}@page{size:A4;margin:18mm 16mm}h2,h3{break-after:avoid}}
</style>
</head>
<body>
<main>
<p class="kicker">${esc(m.roadmap)}</p>
<h1>${esc(title)}</h1>
<p class="updated">${esc(m.updated(now.format(DATE.dateLong)))}</p>
${intro}
<div class="progress"><div class="bar"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>
<p class="progress-text">${esc(m.progress(s.completed, s.total))}</p>
${legend}
<section><h2>${esc(m.planned)}</h2><p class="hint">${esc(m.plannedHint)}</p>${planned}</section>
${undated}
${done}
<footer>${esc(m.footer)}</footer>
</main>
</body>
</html>
`
}

/** Versione in testo semplice (per «Invia per email» con il programma di posta). */
export function roadmapText(p: Project, o: RoadmapOptions, ctx: RoadmapContext): string {
  const now = ctx.now ?? dayjs()
  const s = roadmapSections(p, o, now)
  const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0
  const line = (i: Item, date: string | null) => `- ${date ? `${date} · ` : ''}${firstLine(i.title)}${o.showAssignees && i.assigneeId ? ` (${ctx.userName(i.assigneeId)})` : ''}`
  const out = [`${m.roadmap}: ${o.title.trim() || p.name}`, m.updated(now.format(DATE.dateLong)), '']
  if (o.intro.trim()) out.push(o.intro.trim(), '')
  out.push(`${pct}% · ${m.progress(s.completed, s.total)}`, '', m.planned)
  out.push(...(s.planned.length ? s.planned.map((i) => line(i, dayjs(i.dueDate).format(DATE.dayMonth))) : [m.nothingPlanned]))
  if (s.undated.length) out.push('', m.undated, ...s.undated.map((i) => line(i, null)))
  if (s.done.length) out.push('', m.done, ...s.done.map((i) => line(i, i.completedAt ? dayjs(i.completedAt).format(DATE.dayMonth) : null)))
  return out.join('\n')
}
