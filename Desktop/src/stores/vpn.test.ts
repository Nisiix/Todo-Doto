import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { useVpnStore } from './vpn'

/** VPN dell'ufficio: la «rete» torna quando la VPN simulata si collega. */
function fakeVpn(dataPath: string, opts: { needsCredentials?: boolean } = {}) {
  const state = { connected: false, calls: [] as string[] }
  Object.assign(window, {
    __pgmUnreachable: [dataPath],
    __pgmOffice: {
      vpnList: () => [{ name: 'Ufficio', connected: state.connected, allUsers: true }],
      vpnConnect: (name: string) => {
        state.calls.push(name)
        if (opts.needsCredentials) return { ok: false, code: 691, message: 'Accesso negato' }
        state.connected = true
        Object.assign(window, { __pgmUnreachable: [] })
        return { ok: true, code: 0, message: '' }
      },
    },
  })
  return state
}

describe('VPN dell’ufficio', () => {
  beforeEach(async () => {
    await useSessionStore().init()
    useSessionStore().config.vpn = {}
  })
  afterEach(() => Object.assign(window, { __pgmUnreachable: [], __pgmOffice: undefined }))

  it('aprendo il workspace senza rete si collega la VPN scelta e si apre normalmente', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/vpn1', name: 'Studio', mode: 'network', password: 'segreto1' })
    const id = ws.meta!.id
    await useVpnStore().setPref(id, 'Ufficio', true)
    await ws.close()
    const state = fakeVpn('/rete/vpn1')
    expect(await ws.open('/rete/vpn1')).toEqual({ ok: true })
    expect(state.calls).toEqual(['Ufficio'])
    expect(ws.status).toBe('open')
  })

  it('la cartella cade mentre si lavora: si collega la VPN e si torna in rete', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/vpn2', name: 'Studio', mode: 'network', password: 'segreto1' })
    await useVpnStore().setPref(ws.meta!.id, 'Ufficio', true)
    const state = fakeVpn('/rete/vpn2')
    await ws.refresh()
    await new Promise((r) => setTimeout(r, 20))
    await ws.refresh()
    expect(state.calls).toEqual(['Ufficio'])
    expect(ws.status).toBe('open')
  })

  it('senza collegamento automatico non si collega; credenziali richieste da Windows: lo si segnala', async () => {
    const ws = useWorkspaceStore()
    await ws.create({ path: '/rete/vpn3', name: 'Studio', mode: 'network', password: 'segreto1' })
    const vpn = useVpnStore()
    await vpn.setPref(ws.meta!.id, 'Ufficio', false)
    const state = fakeVpn('/rete/vpn3', { needsCredentials: true })
    await ws.refresh()
    expect(state.calls).toEqual([])
    expect(await vpn.connect('Ufficio')).toMatchObject({ ok: false, needsCredentials: true })
  })
})
