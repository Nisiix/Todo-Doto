import { describe, expect, it } from 'vitest'
import { pcStatus, projectHealth } from './health'
import { prereqHash } from './readiness'
import { ItemSchema, type ReadinessFile } from '@/types'
import type { Signal } from './insights'

const item = ItemSchema.parse({ id: 'i', title: 't', createdAt: '2026-10-01T00:00:00Z', createdBy: 'u' })
const sig = (kind: Signal['kind'], severity: Signal['severity']): Signal => ({ kind, severity, item, days: 1 })

describe('semaforo del progetto', () => {
  it('verde senza problemi', () => {
    expect(projectHealth({ signals: [], lateMilestones: 0, pcMissing: 0 })).toEqual({ level: 'green', reasons: [] })
  })
  it('giallo con un segnale o con PC non pronti; i motivi in ordine di gravità', () => {
    expect(projectHealth({ signals: [sig('stale', 'low'), sig('unanswered', 'medium')], lateMilestones: 0, pcMissing: 0 })).toEqual({
      level: 'yellow',
      reasons: [{ key: 'unanswered', n: 1 }, { key: 'stale', n: 1 }],
    })
    expect(projectHealth({ signals: [], lateMilestones: 0, pcMissing: 2 }).level).toBe('yellow')
    expect(projectHealth({ signals: [sig('stale', 'low')], lateMilestones: 0, pcMissing: 0 }).level).toBe('green')
  })
  it('rosso con 3 ritardi, una tappa in ritardo o 3 segnali gravi', () => {
    const three = [sig('overdue', 'high'), sig('overdue', 'high'), sig('overdue', 'high')]
    expect(projectHealth({ signals: three, lateMilestones: 0, pcMissing: 0 })).toMatchObject({ level: 'red', reasons: [{ key: 'overdue', n: 3 }] })
    expect(projectHealth({ signals: [], lateMilestones: 1, pcMissing: 0 }).level).toBe('red')
    expect(projectHealth({ signals: [sig('urgent_unassigned', 'high'), sig('overdue', 'high'), sig('unanswered', 'high')], lateMilestones: 0, pcMissing: 0 }).level).toBe('red')
  })
})

describe('PC pronti', () => {
  const prereqs = [{ id: 'n', name: 'Node.js', version: '20+', check: 'node -v' }]
  const now = Date.parse('2026-10-20T10:00:00Z')
  const file = (missing: string[], checkedAt = '2026-10-19T10:00:00Z', hash = prereqHash(prereqs)): ReadinessFile => ({
    userId: 'u',
    host: 'PC',
    os: 'windows',
    updatedAt: checkedAt,
    projects: { p: { checkedAt, hash, missing: missing.map((name) => ({ name, status: 'missing', found: '', required: '' })), ok: 1, uncertain: 0 } },
  })
  it('pronto, mancante, sconosciuto; nessun prerequisito = null', () => {
    expect(pcStatus('p', prereqs, file([]), now)?.state).toBe('ready')
    expect(pcStatus('p', prereqs, file(['Node.js']), now)).toMatchObject({ state: 'missing', missing: ['Node.js'] })
    expect(pcStatus('p', prereqs, undefined, now)?.state).toBe('unknown')
    expect(pcStatus('p', prereqs, file([], '2026-08-01T10:00:00Z'), now)?.state).toBe('unknown') // esito vecchio
    expect(pcStatus('p', prereqs, file([], undefined, 'altro'), now)?.state).toBe('unknown') // prerequisiti cambiati
    expect(pcStatus('p', [], file([]), now)).toBeNull()
  })
})
