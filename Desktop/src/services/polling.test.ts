import { describe, expect, it } from 'vitest'
import { IDLE_AFTER_MS, POLL_ACTIVE_MS, POLL_BACKGROUND_MS, POLL_HIDDEN_MS, POLL_IDLE_MS, pollInterval } from './polling'

describe('controllo adattivo della cartella', () => {
  it('spesso con la finestra davanti, meno in secondo piano, poco se lontani o ridotta a icona', () => {
    expect(pollInterval({ hidden: false, focused: true, idleMs: 0 })).toBe(POLL_ACTIVE_MS)
    expect(pollInterval({ hidden: false, focused: false, idleMs: 0 })).toBe(POLL_BACKGROUND_MS)
    expect(pollInterval({ hidden: false, focused: true, idleMs: IDLE_AFTER_MS })).toBe(POLL_IDLE_MS)
    expect(pollInterval({ hidden: true, focused: false, idleMs: 0 })).toBe(POLL_HIDDEN_MS)
  })
})
