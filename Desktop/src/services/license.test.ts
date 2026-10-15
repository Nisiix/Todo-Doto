import { describe, expect, it } from 'vitest'
import * as ed from '@noble/ed25519'
import dayjs from 'dayjs'
import { canonical, describePlan, effectivePlan, parseLicenseText, planFor, seatHolders, trialDaysLeft, verifyLicense } from './license'
import type { License, User } from '@/types'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

/** Coppia di chiavi di test: la chiave pubblica reale non serve per verificare la logica. */
async function keys() {
  const { secretKey, publicKey } = await ed.keygenAsync()
  return { secretKey, pub: hex(publicKey) }
}

const base = (over: Partial<License> = {}): Omit<License, 'sig'> => ({
  v: 1,
  id: 'lic_test',
  plan: 'team',
  seats: 10,
  issuedTo: 'Studio Rossi',
  email: 'info@rossi.it',
  issuedAt: '2026-10-15',
  expiresAt: '2027-10-15',
  order: null,
  ...over,
})

async function sign(payload: Omit<License, 'sig'>, secretKey: Uint8Array): Promise<License> {
  const sig = await ed.signAsync(new TextEncoder().encode(canonical(payload)), secretKey)
  return { ...payload, sig: b64(sig) }
}

describe('licenza: firma', () => {
  it('canonical ordina le chiavi e non mette spazi', () => {
    expect(canonical({ b: 1, a: [true, null, { z: 'x', y: 2 }] })).toBe('{"a":[true,null,{"y":2,"z":"x"}],"b":1}')
  })

  it('accetta una licenza firmata con la chiave giusta', async () => {
    const k = await keys()
    const lic = await sign(base(), k.secretKey)
    const r = await verifyLicense(lic, k.pub)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.license.plan).toBe('team')
  })

  it('rifiuta firma di un altra chiave, payload modificato e formato errato', async () => {
    const k = await keys()
    const other = await keys()
    const lic = await sign(base(), k.secretKey)
    expect((await verifyLicense(lic, other.pub)).ok).toBe(false)
    expect((await verifyLicense({ ...lic, seats: 100 }, k.pub)).ok).toBe(false)
    expect((await verifyLicense({ ...lic, plan: 'business' }, k.pub)).ok).toBe(false)
    expect((await verifyLicense({ hello: 'world' }, k.pub)).ok).toBe(false)
    expect((await verifyLicense({ ...lic, sig: 'non-base64!!' }, k.pub)).ok).toBe(false)
  })

  it('parseLicenseText tollera testo attorno al JSON', () => {
    const o = parseLicenseText('Ecco la tua licenza:\n\n{"v":1,"plan":"team"}\n\nGrazie')
    expect(o).toEqual({ v: 1, plan: 'team' })
    expect(() => parseLicenseText('niente')).toThrow()
  })
})

describe('licenza: piano effettivo', () => {
  const today = dayjs('2026-11-01')

  it('senza licenza né prova: Free con 3 posti', () => {
    const s = effectivePlan(null, null, today)
    expect(s.plan).toBe('free')
    expect(s.seats).toBe(3)
    expect(s.source).toBe('free')
    expect(describePlan(s)).toBe('Free')
  })

  it('licenza valida: il piano e i posti della licenza', () => {
    const s = effectivePlan({ ...base({ plan: 'business', seats: 40 }), sig: 'x' }, null, today)
    expect(s.plan).toBe('business')
    expect(s.seats).toBe(40)
    expect(s.licenseStatus).toBe('valid')
    expect(describePlan(s)).toMatch(/Business · fino al 15 ott 2027/)
  })

  it('licenza scaduta: torna Free e lo dice', () => {
    const s = effectivePlan({ ...base({ expiresAt: '2026-10-31' }), sig: 'x' }, null, today)
    expect(s.plan).toBe('free')
    expect(s.licenseStatus).toBe('expired')
    expect(describePlan(s)).toMatch(/scaduta/)
  })

  it('prova: Team per 14 giorni, poi Free', () => {
    const trial = { startedAt: '2026-10-25T10:00:00.000Z', startedBy: 'usr_a' }
    expect(trialDaysLeft(trial, dayjs('2026-10-25T12:00:00Z'))).toBe(14)
    const active = effectivePlan(null, trial, today)
    expect(active.plan).toBe('team')
    expect(active.source).toBe('trial')
    expect(active.trialDaysLeft).toBeGreaterThan(0)
    const over = effectivePlan(null, trial, dayjs('2026-11-20'))
    expect(over.plan).toBe('free')
    expect(over.trialUsed).toBe(true)
    expect(over.trialActive).toBe(false)
  })

  it('la licenza vince sulla prova', () => {
    const trial = { startedAt: today.toISOString(), startedBy: 'usr_a' }
    expect(effectivePlan({ ...base(), sig: 'x' }, trial, today).source).toBe('license')
  })

  it('planFor indica il piano minimo', () => {
    expect(planFor('export')).toBe('team')
    expect(planFor('auditUnlimited')).toBe('business')
  })
})

describe('licenza: posti', () => {
  const u = (id: string, role: User['role'], createdAt: string): User => ({ id, username: id, hostname: 'PC', displayName: id, role, createdAt })

  it('gli admin hanno sempre un posto, gli altri per ordine di ingresso', () => {
    const users = [u('c', 'member', '2026-01-03'), u('a', 'member', '2026-01-01'), u('b', 'member', '2026-01-02'), u('boss', 'admin', '2026-01-09')]
    const holders = seatHolders(users, 3)
    expect([...holders].sort()).toEqual(['a', 'b', 'boss'])
    expect(holders.has('c')).toBe(false)
  })

  it('con posti a sufficienza tutti scrivono', () => {
    const users = [u('a', 'admin', '2026-01-01'), u('b', 'member', '2026-01-02')]
    expect(seatHolders(users, 10).size).toBe(2)
  })
})
