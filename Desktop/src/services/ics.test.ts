import { describe, expect, it } from 'vitest'
import { buildIcs, foldLine, icsFileName, icsText, personalEvents, projectEvents } from './ics'
import { ItemSchema, ProjectSchema } from '@/types'

const T = '2026-10-01T10:00:00.000Z'
const p = ProjectSchema.parse({
  id: 'p1',
  name: 'Portale',
  createdAt: T,
  createdBy: 'me',
  updatedAt: T,
  updatedBy: 'me',
  milestones: [{ id: 'mst_1', name: 'v1', dueDate: '2026-11-30', createdAt: T }, { id: 'mst_2', name: 'vecchia', dueDate: '2026-09-01', closedAt: T, createdAt: T }],
  items: [
    ItemSchema.parse({ id: 'i1', seq: 1, title: 'Export, CSV; v2', notes: 'riga 1\nriga 2', createdAt: T, createdBy: 'me', assigneeId: 'me', status: 'confermato', dueDate: '2026-11-10' }),
    ItemSchema.parse({ id: 'i2', seq: 2, title: 'Di Anna', createdAt: T, createdBy: 'me', assigneeId: 'anna', status: 'confermato', dueDate: '2026-11-12' }),
    ItemSchema.parse({ id: 'i3', seq: 3, title: 'Fatto', createdAt: T, createdBy: 'me', bucket: 'done', status: 'confermato', dueDate: '2026-11-01' }),
    ItemSchema.parse({ id: 'i4', seq: 4, title: 'Senza data', createdAt: T, createdBy: 'me' }),
  ],
})
const label = (n: string) => `Tappa ${n}`

describe('calendari .ics', () => {
  it('testo protetto e righe spezzate a 75 byte', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne')
    const long = `SUMMARY:${'è'.repeat(60)}`
    const folded = foldLine(long)
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('eventi del progetto: task da fare con scadenza e tappe aperte', () => {
    const ev = projectEvents(p, { milestoneLabel: label })
    expect(ev.map((e) => [e.date, e.summary])).toEqual([
      ['2026-11-10', 'TODO-1 Export, CSV; v2'],
      ['2026-11-12', 'TODO-2 Di Anna'],
      ['2026-11-30', 'Tappa v1'],
    ])
  })

  it('calendario personale: solo i miei, con il nome del progetto', () => {
    expect(personalEvents([p], 'me', false, label).map((e) => e.summary)).toEqual(['[Portale] TODO-1 Export, CSV; v2'])
    expect(personalEvents([p], 'me', true, label)).toHaveLength(2) // in locale tutti i task sono miei
  })

  it('file iCalendar valido, stabile e con eventi di un giorno', () => {
    const ics = buildIcs('Portale', projectEvents(p, { milestoneLabel: label }))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111')
    expect(ics).toContain('SUMMARY:TODO-1 Export\\, CSV\; v2')
    expect(ics).toContain('DESCRIPTION:riga 1\\nriga 2')
    expect(ics).toContain('DTSTAMP:20261001T100000Z')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(buildIcs('Portale', projectEvents(p, { milestoneLabel: label }))).toBe(ics)
  })

  it('nomi di file sicuri', () => {
    expect(icsFileName('Mario Rossi')).toBe('mario-rossi.ics')
    expect(icsFileName('Città è / 3')).toBe('citta-e-3.ics')
    expect(icsFileName('***')).toBe('calendario.ics')
  })
})
