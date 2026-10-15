/**
 * Export del progetto: CSV (apribile in Excel) e dati per la stampa/PDF.
 * Funzioni pure, testate in export.test.ts.
 */
import { BUCKET_LABEL, PRIORITY_LABEL, STATUS_LABEL, type Label, type Project, type User } from '@/types'
import { sortForBucket } from './items'
import { t } from '@/i18n'

const CSV_SEP = ';' // Excel in italiano si aspetta il punto e virgola

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ExportContext {
  users: User[]
  labels: Label[]
}

/** Righe del progetto nell'ordine della lista: da fare, completati, cestino. */
export function projectRows(project: Project, ctx: ExportContext) {
  const userName = (id: string) => ctx.users.find((u) => u.id === id)?.displayName ?? id
  const labelName = (id: string | null) => (id ? (ctx.labels.find((l) => l.id === id)?.name ?? '') : '')
  const out: Record<string, string | number | null>[] = []
  for (const bucket of ['todo', 'done', 'trash'] as const) {
    for (const it of sortForBucket(
      project.items.filter((i) => i.bucket === bucket),
      bucket,
    )) {
      out.push({
        [t('Contenitore')]: t(BUCKET_LABEL[bucket]),
        [t('Titolo')]: it.title,
        [t('Descrizione')]: it.notes,
        [t('Priorità')]: t(PRIORITY_LABEL[it.priority]),
        [t('Stato')]: t(STATUS_LABEL[it.status]),
        [t('Scadenza')]: it.dueDate,
        [t('Etichetta')]: labelName(it.labelId),
        [t('Creato da')]: userName(it.createdBy),
        [t('Creato il')]: it.createdAt.slice(0, 10),
        [t('Completato il')]: it.completedAt ? it.completedAt.slice(0, 10) : null,
        [t('Domande aperte')]: it.questions.filter((q) => !q.resolved).length,
        [t('Commenti')]: it.comments.length,
      })
    }
  }
  return out
}

export function projectToCsv(project: Project, ctx: ExportContext): string {
  const rows = projectRows(project, ctx)
  const headers = rows[0] ? Object.keys(rows[0]) : [t('Contenitore'), t('Titolo')]
  const lines = [headers.map(cell).join(CSV_SEP), ...rows.map((r) => headers.map((h) => cell(r[h])).join(CSV_SEP))]
  // BOM: così Excel riconosce l'UTF-8 e gli accenti restano giusti
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Nome file sicuro: "Bilancio Europeo Web" → "bilancio-europeo-web". */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'progetto'
  )
}
