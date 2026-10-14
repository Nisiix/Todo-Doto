/**
 * Lingua dell'interfaccia.
 *
 * La lingua è decisa in fase di build (`VITE_LOCALE=it|en`): ogni installer
 * contiene l'app in una sola lingua, quella scelta al momento del download.
 * Per provare l'inglese in sviluppo: `VITE_LOCALE=en npm run dev`.
 *
 * I testi stanno accanto al codice che li usa: `defineMessages({ it, en })`
 * restituisce quelli della lingua corrente e il compilatore verifica che le
 * due versioni abbiano le stesse chiavi. I testi condivisi sono in `common.ts`.
 */
export const LOCALES = ['it', 'en'] as const
export type Locale = (typeof LOCALES)[number]

const env = (import.meta.env.VITE_LOCALE ?? '').toLowerCase()
export const locale: Locale = (LOCALES as readonly string[]).includes(env) ? (env as Locale) : 'it'

/** Tag BCP 47 per Intl, `localeCompare` e l'attributo `lang`. */
export const localeTag = locale === 'en' ? 'en-US' : 'it-IT'

export function defineMessages<T>(messages: { it: T; en: NoInfer<T> }): T {
  return messages[locale]
}

/** Formati di data (dayjs) per la lingua corrente. */
export const DATE = defineMessages({
  it: { dayMonth: 'D MMM', date: 'D MMM YYYY', dateLong: 'D MMMM YYYY', dateTime: 'D MMM YYYY HH:mm', dateTimeLong: 'D MMMM YYYY HH:mm:ss' },
  en: { dayMonth: 'MMM D', date: 'MMM D, YYYY', dateLong: 'MMMM D, YYYY', dateTime: 'MMM D, YYYY HH:mm', dateTimeLong: 'MMMM D, YYYY HH:mm:ss' },
})

/** Confronto alfabetico secondo la lingua dell'interfaccia. */
export const compareText = (a: string, b: string) => a.localeCompare(b, locale)

/** Sceglie singolare o plurale (le due lingue usano la stessa regola: 1 = singolare). */
export const plural = (n: number, one: string, other: string) => (n === 1 ? one : other)
