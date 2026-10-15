import { afterEach, describe, expect, it } from 'vitest'
import { locale, setLocale, systemLocale, t, tn, translatedKeys } from './index'
import { en } from './en'

describe('i18n', () => {
  afterEach(() => setLocale('it'))

  it('in italiano la chiave è il testo; in inglese si traduce; una chiave sconosciuta resta com’è', () => {
    expect(t('Nuovo elemento')).toBe('Nuovo elemento')
    setLocale('en')
    expect(locale.value).toBe('en')
    expect(t('Nuovo elemento')).toBe('New item')
    expect(t('Chiave inesistente')).toBe('Chiave inesistente')
  })

  it('interpola i parametri e gestisce il plurale in entrambe le lingue', () => {
    expect(t('{n} elementi', { n: 3 })).toBe('3 elementi')
    expect(tn(1, '1 elemento', '{n} elementi')).toBe('1 elemento')
    expect(tn(4, '1 elemento', '{n} elementi')).toBe('4 elementi')
    setLocale('en')
    expect(tn(4, '1 elemento', '{n} elementi')).toBe('4 items')
    expect(t('{user} su {host}', { user: 'mrossi', host: 'PC' })).toBe('mrossi on PC')
  })

  it('le traduzioni conservano i segnaposto delle chiavi', () => {
    for (const [k, v] of Object.entries(en)) {
      const params = k.match(/\{\w+\}/g) ?? []
      for (const p of params) expect(v, `traduzione di «${k}»`).toContain(p)
    }
    expect(translatedKeys().length).toBeGreaterThan(400)
  })

  it('systemLocale riconosce l’inglese', () => {
    expect(['it', 'en']).toContain(systemLocale())
  })
})
