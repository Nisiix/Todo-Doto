import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { buildTimeline, weekStart } from './timeline'
import type { Item, Project } from '@/types'

const item = (title: string, dueDate: string | null, over: Partial<Item> = {}): Item => ({
  id: 'itm_' + title,
  title,
  notes: '',
  priority: 'media',
  status: 'da_valutare',
  dueDate,
  labelId: null,
  bucket: 'todo',
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: 'u',
  completedAt: null,
  trashedAt: null,
  comments: [],
  questions: [],
  ...over,
})
const project = (name: string, items: Item[]) => ({ id: 'prj_' + name, name, items }) as unknown as Project

describe('timeline', () => {
  const now = dayjs('2026-10-15') // giovedì

  it('weekStart è lunedì', () => {
    expect(weekStart(now).format('YYYY-MM-DD')).toBe('2026-10-12')
    expect(weekStart(dayjs('2026-10-12')).format('YYYY-MM-DD')).toBe('2026-10-12')
    expect(weekStart(dayjs('2026-10-18')).format('YYYY-MM-DD')).toBe('2026-10-12')
  })

  it('distribuisce per colonne: scadute, settimane, più avanti, senza scadenza', () => {
    const cols = buildTimeline(
      [
        project('A', [item('ieri', '2026-10-14'), item('oggi', '2026-10-15', { priority: 'immediata' }), item('domenica', '2026-10-18'), item('lun prossimo', '2026-10-19')]),
        project('B', [item('lontano', '2027-01-10'), item('mai', null), item('fatto', '2026-10-15', { bucket: 'done' })]),
      ],
      2,
      now,
    )
    const names = (id: string) => cols.find((c) => c.id === id)!.entries.map((e) => e.item.title)
    expect(names('overdue')).toEqual(['ieri'])
    expect(names('w0')).toEqual(['oggi', 'domenica'])
    expect(names('w1')).toEqual(['lun prossimo'])
    expect(names('later')).toEqual(['lontano'])
    expect(names('none')).toEqual(['mai'])
    expect(cols.map((c) => c.id)).toEqual(['overdue', 'w0', 'w1', 'later', 'none'])
    expect(cols[1]!.hint).toBe('12 ott – 18 ott')
  })

  it('numera le settimane in stile ISO', () => {
    expect(dayjs('2026-01-01').isoWeekLike()).toBe(1)
    expect(dayjs('2026-10-15').isoWeekLike()).toBe(42)
  })
})
