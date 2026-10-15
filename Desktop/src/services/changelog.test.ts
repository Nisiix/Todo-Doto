import { describe, expect, it } from 'vitest'
import { parseChangelog } from './changelog'
import changelog from '../../CHANGELOG.md?raw'

describe('changelog', () => {
  it('estrae le release con i loro punti', () => {
    const r = parseChangelog('# Novità\n\nintro\n\n## 1.1.0 — oggi\n\n- a\n- b\n\n## 1.0.0 — ieri\n- c\n')
    expect(r).toEqual([
      { title: '1.1.0 — oggi', items: ['a', 'b'] },
      { title: '1.0.0 — ieri', items: ['c'] },
    ])
  })

  it('il CHANGELOG del progetto ha una release corrente con almeno un punto', () => {
    const r = parseChangelog(changelog)
    expect(r.length).toBeGreaterThan(0)
    expect(r[0]!.items.length).toBeGreaterThan(0)
  })
})
