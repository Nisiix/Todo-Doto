import { describe, expect, it } from 'vitest'
import { feedbackUrl, isCheckDue, isNewer, osLabel, parseRelease, parseVersion } from './feedback'

const info = { version: '0.7.0', os: 'Windows 10/11', locale: 'it' }
const subject = (k: string) => `Todo Doto 0.7.0 · ${k}`

describe('link di feedback', () => {
  it('segnalazione con il modello e la versione già compilati', () => {
    expect(feedbackUrl('bug', info, subject)).toBe('https://github.com/Nisiix/Todo-Doto/issues/new?template=bug_report.yml&version=0.7.0&os=Windows%2010%2F11')
  })
  it('idee e domande nelle discussioni, nella categoria giusta', () => {
    expect(feedbackUrl('idea', info, subject)).toBe('https://github.com/Nisiix/Todo-Doto/discussions/new?category=ideas&version=0.7.0')
    expect(feedbackUrl('question', info, subject)).toContain('category=q-a')
  })
  it('email all’autore con oggetto e versione', () => {
    const url = feedbackUrl('email', info, subject)
    expect(url.startsWith('mailto:nisos@live.it?subject=Todo%20Doto%200.7.0%20%C2%B7%20email&body=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('Todo Doto 0.7.0 · Windows 10/11 · it')
  })
  it('sistema dallo user agent', () => {
    expect(osLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows 10/11')
    expect(osLabel('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux')
    expect(osLabel('qualcosa')).toBe('')
  })
})

describe('versioni', () => {
  it('confronto numerico, con o senza «v»', () => {
    expect(parseVersion('v0.10.2')).toEqual([0, 10, 2])
    expect(parseVersion('0.7')).toBeNull()
    expect(isNewer('0.10.0', '0.9.9')).toBe(true)
    expect(isNewer('v0.7.1', '0.7.0')).toBe(true)
    expect(isNewer('0.7.0', '0.7.0')).toBe(false)
    expect(isNewer('0.6.9', '0.7.0')).toBe(false)
    expect(isNewer('nightly', '0.7.0')).toBe(false)
  })
  it('Release pubblicata: niente bozze, anteprime o link estranei', () => {
    const base = { tag_name: 'v0.8.0', html_url: 'https://github.com/Nisiix/Todo-Doto/releases/tag/v0.8.0', published_at: '2026-11-01T10:00:00Z', body: ' Novità ' }
    expect(parseRelease(base)).toEqual({ version: '0.8.0', url: base.html_url, publishedAt: base.published_at, notes: 'Novità' })
    expect(parseRelease({ ...base, draft: true })).toBeNull()
    expect(parseRelease({ ...base, prerelease: true })).toBeNull()
    expect(parseRelease({ ...base, tag_name: 'ultima' })).toBeNull()
    expect(parseRelease({ ...base, html_url: 'https://altro.example/x' })!.url).toBe('https://github.com/Nisiix/Todo-Doto/releases')
    expect(parseRelease(null)).toBeNull()
  })
  it('un controllo al giorno', () => {
    const now = Date.parse('2026-10-22T12:00:00Z')
    expect(isCheckDue('', now)).toBe(true)
    expect(isCheckDue('2026-10-22T08:00:00Z', now)).toBe(false)
    expect(isCheckDue('2026-10-21T11:00:00Z', now)).toBe(true)
    expect(isCheckDue('rotto', now)).toBe(true)
  })
})
