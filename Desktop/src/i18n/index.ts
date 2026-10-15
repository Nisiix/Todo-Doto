/**
 * Internazionalizzazione minima, senza dipendenze: le stringhe italiane
 * dell'interfaccia sono le chiavi, `en.ts` contiene le traduzioni.
 *
 *   t('Nuovo elemento')                      → 'New item' in inglese
 *   t('{n} progetti', { n: 3 })              → interpolazione {nome}
 *   tn(n, '1 progetto', '{n} progetti')      → singolare/plurale
 *
 * Una chiave senza traduzione resta in italiano: l'app non si rompe mai per
 * una stringa mancante. La lingua è reattiva (store ui → `setLocale`).
 */
import { ref } from 'vue'
import dayjs from 'dayjs'
import 'dayjs/locale/en'
import 'dayjs/locale/it'
import { en } from './en'

export type Locale = 'it' | 'en'
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
]

export const locale = ref<Locale>('it')

/** Lingua del sistema, se supportata. */
export function systemLocale(): Locale {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'it').toLowerCase()
  return lang.startsWith('en') ? 'en' : 'it'
}

export function setLocale(l: Locale) {
  locale.value = l
  dayjs.locale(l)
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

type Params = Record<string, string | number>

function interpolate(s: string, params?: Params): string {
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

/** Traduce una stringa italiana (chiave) nella lingua corrente. */
export function t(key: string, params?: Params): string {
  const msg = locale.value === 'en' ? (en[key] ?? key) : key
  return interpolate(msg, params)
}

/** Singolare o plurale in base a `n`; entrambe le forme sono chiavi. */
export function tn(n: number, singular: string, plural: string, params?: Params): string {
  return t(n === 1 ? singular : plural, { n, ...params })
}

/** Chiavi italiane presenti in `en.ts` (per i test e per la revisione). */
export const translatedKeys = () => Object.keys(en)
