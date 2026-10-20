import { describe, expect, it } from 'vitest'
import { fold, parseDateExpr, parseQuickAdd, stripTokens } from './quickAdd'

// 20 ottobre 2026 è un martedì
const today = '2026-10-20'
const ctx = {
  today,
  meId: 'u-me',
  users: [
    { id: 'u1', username: 'mrossi', displayName: 'Mario Rossi' },
    { id: 'u2', username: 'mbianchi', displayName: 'Marta Bianchi' },
    { id: 'u3', username: 'lverdi', displayName: 'Luca Verdi' },
  ],
  milestones: [
    { id: 'm1', name: 'v1.3' },
    { id: 'm2', name: 'Rilascio cliente' },
  ],
  labels: [
    { id: 'l1', name: 'Bug' },
    { id: 'l2', name: 'Nuova funzione' },
    { id: 'l3', name: 'Backend' },
  ],
}

describe('parseDateExpr', () => {
  it('giorni relativi', () => {
    expect(parseDateExpr('oggi', today)).toBe('2026-10-20')
    expect(parseDateExpr('domani', today)).toBe('2026-10-21')
    expect(parseDateExpr('dopodomani', today)).toBe('2026-10-22')
    expect(parseDateExpr('Tomorrow', today)).toBe('2026-10-21')
    expect(parseDateExpr('tra 3 giorni', today)).toBe('2026-10-23')
    expect(parseDateExpr('fra 2 settimane', today)).toBe('2026-11-03')
    expect(parseDateExpr('in 1 month', today)).toBe('2026-11-20')
  })

  it('giorni della settimana: sempre il prossimo, mai oggi', () => {
    expect(parseDateExpr('venerdì', today)).toBe('2026-10-23')
    expect(parseDateExpr('ven', today)).toBe('2026-10-23')
    expect(parseDateExpr('friday', today)).toBe('2026-10-23')
    expect(parseDateExpr('lunedì', today)).toBe('2026-10-26')
    expect(parseDateExpr('martedì', today)).toBe('2026-10-27')
  })

  it('fine settimana, fine mese, prossima settimana', () => {
    expect(parseDateExpr('fine settimana', today)).toBe('2026-10-23')
    expect(parseDateExpr('fine mese', today)).toBe('2026-10-31')
    expect(parseDateExpr('prossima settimana', today)).toBe('2026-10-26')
  })

  it('date numeriche: giorno/mese in italiano, mese/giorno in inglese, anno successivo se già passata', () => {
    expect(parseDateExpr('15/11', today)).toBe('2026-11-15')
    expect(parseDateExpr('15.11.2027', today)).toBe('2027-11-15')
    expect(parseDateExpr('15/11/27', today)).toBe('2027-11-15')
    expect(parseDateExpr('11/15', today, false)).toBe('2026-11-15')
    expect(parseDateExpr('1/3', today)).toBe('2027-03-01')
    expect(parseDateExpr('2026-12-01', today)).toBe('2026-12-01')
  })

  it('nomi dei mesi', () => {
    expect(parseDateExpr('15 novembre', today)).toBe('2026-11-15')
    expect(parseDateExpr('3 gen', today)).toBe('2027-01-03')
    expect(parseDateExpr('nov 15', today)).toBe('2026-11-15')
    expect(parseDateExpr('15 nov 2027', today)).toBe('2027-11-15')
  })

  it('date impossibili e testo qualunque: null', () => {
    expect(parseDateExpr('31/02', today)).toBeNull()
    expect(parseDateExpr('2026-13-01', today)).toBeNull()
    expect(parseDateExpr('cliente', today)).toBeNull()
  })
})

describe('parseQuickAdd', () => {
  it('riconosce priorità, assegnatario, etichetta e scadenza e li toglie dal titolo', () => {
    const r = parseQuickAdd('Esportazione CSV !alta @mario #bug entro venerdì', ctx)
    expect(r.title).toBe('Esportazione CSV')
    expect(r.priority).toBe('alta')
    expect(r.assigneeId).toBe('u1')
    expect(r.labelId).toBe('l1')
    expect(r.dueDate).toBe('2026-10-23')
    expect(r.tokens.map((t) => t.kind)).toEqual(['priority', 'assignee', 'label', 'due'])
  })

  it('una data senza indicatore resta nel titolo', () => {
    const r = parseQuickAdd('Report di oggi per il cliente', ctx)
    expect(r.title).toBe('Report di oggi per il cliente')
    expect(r.dueDate).toBeNull()
  })

  it('indicatori di data in italiano e inglese, e la forma «tra N giorni»', () => {
    expect(parseQuickAdd('Rilascio per domani', ctx).dueDate).toBe('2026-10-21')
    expect(parseQuickAdd('Rilascio entro il 15/11', ctx).dueDate).toBe('2026-11-15')
    expect(parseQuickAdd('Rilascio ^15 novembre', ctx).dueDate).toBe('2026-11-15')
    expect(parseQuickAdd('Release by friday', ctx).dueDate).toBe('2026-10-23')
    const r = parseQuickAdd('Controllare i log tra 3 giorni', ctx)
    expect(r.dueDate).toBe('2026-10-23')
    expect(r.title).toBe('Controllare i log')
  })

  it('priorità con numeri e parole inglesi; parola sconosciuta lasciata nel titolo', () => {
    expect(parseQuickAdd('A !1', ctx).priority).toBe('immediata')
    expect(parseQuickAdd('A !urgent', ctx).priority).toBe('immediata')
    expect(parseQuickAdd('A !low', ctx).priority).toBe('bassa')
    const r = parseQuickAdd('Ciao !mondo', ctx)
    expect(r.priority).toBeNull()
    expect(r.title).toBe('Ciao !mondo')
  })

  it('utenti: nome utente, nome intero, primo nome, inizio non ambiguo, @io', () => {
    expect(parseQuickAdd('A @lverdi', ctx).assigneeId).toBe('u3')
    expect(parseQuickAdd('A @MarioRossi', ctx).assigneeId).toBe('u1')
    expect(parseQuickAdd('A @luca', ctx).assigneeId).toBe('u3')
    expect(parseQuickAdd('A @marta', ctx).assigneeId).toBe('u2')
    expect(parseQuickAdd('A @io', ctx).assigneeId).toBe('u-me')
    // «mar» è l'inizio sia di Mario sia di Marta: ambiguo, resta nel titolo
    const r = parseQuickAdd('A @mar', ctx)
    expect(r.assigneeId).toBeNull()
    expect(r.title).toBe('A @mar')
  })

  it('etichette: nome senza spazi o inizio non ambiguo; le email non sono menzioni', () => {
    expect(parseQuickAdd('A #nuovafunzione', ctx).labelId).toBe('l2')
    expect(parseQuickAdd('A #nuova', ctx).labelId).toBe('l2')
    expect(parseQuickAdd('A #ba', ctx).labelId).toBe('l3')
    expect(parseQuickAdd('A #b', ctx).labelId).toBeNull()
    expect(parseQuickAdd('Scrivere a mario@example.com', ctx).assigneeId).toBeNull()
  })

  it('per ogni tipo vale il primo; il secondo resta nel titolo', () => {
    const r = parseQuickAdd('A !alta !bassa', ctx)
    expect(r.priority).toBe('alta')
    expect(r.title).toBe('A !bassa')
  })

  it('punteggiatura dopo un comando', () => {
    const r = parseQuickAdd('Chiamare il fornitore @luca, entro domani.', ctx)
    expect(r.assigneeId).toBe('u3')
    expect(r.dueDate).toBe('2026-10-21')
    expect(r.title).toBe('Chiamare il fornitore.')
  })

  it('tappa: nome intero o inizio, anche con il punto', () => {
    const r = parseQuickAdd('Export ~v1.3 !alta', ctx)
    expect(r.milestoneId).toBe('m1')
    expect(r.title).toBe('Export')
    expect(parseQuickAdd('Demo ~rilascio', ctx).milestoneId).toBe('m2')
    expect(parseQuickAdd('Demo ~v2', ctx).milestoneId).toBeNull()
  })

  it('le espressioni da ignorare restano nel titolo', () => {
    const r = parseQuickAdd('Rilascio per domani !alta', { ...ctx, ignore: ['Per Domani'] })
    expect(r.dueDate).toBeNull()
    expect(r.priority).toBe('alta')
    expect(r.title).toBe('Rilascio per domani')
  })

  it('testo senza comandi: invariato', () => {
    const r = parseQuickAdd('  Pagina di accesso  ', ctx)
    expect(r).toMatchObject({ title: 'Pagina di accesso', priority: null, assigneeId: null, labelId: null, dueDate: null, milestoneId: null, tokens: [] })
  })
})

describe('utilità', () => {
  it('fold toglie accenti, maiuscole e spazi', () => {
    expect(fold('Venerdì Santo')).toBe('venerdisanto')
  })
  it('stripTokens ricompone gli spazi', () => {
    expect(stripTokens('a b c', [{ start: 2, end: 3 }])).toBe('a c')
  })
})
