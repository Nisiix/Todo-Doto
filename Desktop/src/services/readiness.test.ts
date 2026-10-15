import { describe, expect, it } from 'vitest'
import { buildEntry, incompleteUsers, isCurrent, missingSignature, prereqHash, sameEntry, READINESS_MAX_AGE_DAYS } from './readiness'
import type { CheckResult } from './prereqCheck'
import type { Prerequisite, ReadinessFile, User } from '@/types'

const pre = (id: string, name: string, version = ''): Prerequisite => ({ id, name, version, url: '', check: '' })
const res = (status: CheckResult['status'], version = ''): CheckResult => ({ status, version, command: 'x', output: '' })
const user = (id: string, name: string, role: User['role'] = 'member'): User => ({ id, username: id, hostname: 'PC', displayName: name, role, createdAt: '' })

const node = pre('p1', 'Node.js', '20+')
const dotnet = pre('p2', '.NET SDK', '8')

describe('configurazione dei PC: esito per progetto', () => {
  it('l’impronta cambia quando cambiano i prerequisiti, non altrimenti', () => {
    expect(prereqHash([node, dotnet])).toBe(prereqHash([{ ...node }, { ...dotnet }]))
    expect(prereqHash([node])).not.toBe(prereqHash([node, dotnet]))
    expect(prereqHash([node])).not.toBe(prereqHash([{ ...node, version: '22+' }]))
  })

  it('raccoglie mancanti e da aggiornare; null se la verifica non è finita o non si è potuta fare', () => {
    const e = buildEntry([node, dotnet], { p1: res('missing'), p2: res('outdated', '6.0.1') })!
    expect(e.missing).toEqual([
      { name: 'Node.js', status: 'missing', found: '', required: '20+' },
      { name: '.NET SDK', status: 'outdated', found: '6.0.1', required: '8' },
    ])
    expect(buildEntry([node, dotnet], { p1: res('ok', '20.1') })).toBeNull() // p2 non ancora verificato
    expect(buildEntry([node], { p1: res('unavailable') })).toBeNull() // nel browser i comandi non girano
    expect(buildEntry([], {})).toBeNull()
    const ok = buildEntry([node, dotnet], { p1: res('ok', '20.1'), p2: res('manual') })!
    expect(ok.missing).toEqual([])
    expect(ok.ok).toBe(1)
    expect(ok.uncertain).toBe(1)
  })

  it('un esito vale finché i prerequisiti sono gli stessi e non è troppo vecchio', () => {
    const now = Date.parse('2026-10-15T10:00:00Z')
    const e = buildEntry([node], { p1: res('missing') }, '2026-10-14T10:00:00Z')!
    expect(isCurrent(e, prereqHash([node]), now)).toBe(true)
    expect(isCurrent(e, prereqHash([node, dotnet]), now)).toBe(false)
    expect(isCurrent(e, prereqHash([node]), now + READINESS_MAX_AGE_DAYS * 86_400_000)).toBe(false)
  })

  it('firma e confronto: la stessa mancanza è la stessa notizia', () => {
    const a = buildEntry([node, dotnet], { p1: res('missing'), p2: res('ok') }, '2026-10-01T00:00:00Z')!
    const b = buildEntry([node, dotnet], { p1: res('missing'), p2: res('ok') }, '2026-10-15T00:00:00Z')!
    expect(missingSignature(a)).toBe(missingSignature(b))
    expect(sameEntry(a, b)).toBe(true)
    const c = buildEntry([node, dotnet], { p1: res('missing'), p2: res('missing') })!
    expect(missingSignature(c)).not.toBe(missingSignature(a))
    expect(sameEntry(a, c)).toBe(false)
  })
})

describe('configurazione dei PC: utenti con configurazione incompleta', () => {
  const now = Date.parse('2026-10-15T10:00:00Z')
  const at = '2026-10-15T09:00:00Z'
  const prereqs = [node]
  const file = (userId: string, missing: boolean, hash = prereqHash(prereqs), checkedAt = at): ReadinessFile => ({
    userId,
    host: `PC-${userId}`,
    os: 'windows',
    updatedAt: at,
    projects: { prj_1: { checkedAt, hash, missing: missing ? [{ name: 'Node.js', status: 'missing', found: '', required: '20+' }] : [], ok: missing ? 0 : 1, uncertain: 0 } },
  })
  const users = [user('u1', 'Anna'), user('u2', 'Bruno'), user('u3', 'Carla'), user('u4', 'Dario'), user('u5', 'Elena'), user('u6', 'Fabio')]
  const files = {
    u1: file('u1', true), // incompleta: compare
    u2: file('u2', false), // completa
    u3: file('u3', true, 'vecchiaimpronta'), // stack cambiato dopo la verifica: non si sa
    u4: file('u4', true, prereqHash(prereqs), '2026-08-01T00:00:00Z'), // troppo vecchio
    u5: file('u5', true), // non vede il progetto
    // u6: mai verificato
  }

  it('mostra solo chi vede il progetto e ha un esito attuale con qualcosa che manca', () => {
    const list = incompleteUsers('prj_1', prereqs, users, files, (u) => u.id !== 'u5', now)
    expect(list.map((r) => r.user.displayName)).toEqual(['Anna'])
    expect(list[0]!.host).toBe('PC-u1')
  })

  it('progetto senza prerequisiti: nessun avviso', () => {
    expect(incompleteUsers('prj_1', [], users, files, () => true, now)).toEqual([])
  })
})
