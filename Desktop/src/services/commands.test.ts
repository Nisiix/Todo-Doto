import { describe, expect, it } from 'vitest'
import { matchCommands, parsePaletteQuery } from './commands'

describe('palette dei comandi', () => {
  it('modalità dalla richiesta', () => {
    expect(parsePaletteQuery('login')).toEqual({ mode: 'search', text: 'login' })
    expect(parsePaletteQuery('> oggi')).toEqual({ mode: 'commands', text: 'oggi' })
    expect(parsePaletteQuery('>')).toEqual({ mode: 'commands', text: '' })
    expect(parsePaletteQuery('  + Fix login !alta ')).toEqual({ mode: 'add', text: 'Fix login !alta' })
  })

  const cmds = [
    { id: 'today', label: 'Vai a Oggi', keywords: ['today', 'giornata'] },
    { id: 'settings', label: 'Impostazioni', keywords: ['settings', 'preferenze'] },
    { id: 'theme', label: 'Tema chiaro o scuro', keywords: ['dark mode'] },
    { id: 'gantt', label: 'Gantt del progetto' },
  ]

  it('tutte le parole, senza maiuscole né accenti, anche nelle parole chiave', () => {
    expect(matchCommands(cmds, 'imp').map((c) => c.id)).toEqual(['settings'])
    expect(matchCommands(cmds, 'DARK').map((c) => c.id)).toEqual(['theme'])
    expect(matchCommands(cmds, 'gantt progetto').map((c) => c.id)).toEqual(['gantt'])
    expect(matchCommands(cmds, 'gantt cliente')).toEqual([])
  })

  it('prima i nomi che iniziano con il testo; testo vuoto: tutti', () => {
    const list = [{ id: 'a', label: 'Apri Oggi' }, { id: 'b', label: 'Oggi' }]
    expect(matchCommands(list, 'oggi').map((c) => c.id)).toEqual(['b', 'a'])
    expect(matchCommands(cmds, '  ')).toHaveLength(4)
  })
})
