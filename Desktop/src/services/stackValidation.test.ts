import { describe, expect, it } from 'vitest'
import { EMPTY_STACK, type Stack } from '@/types'
import { KNOWN_PREREQUISITES } from './prerequisites'
import { varsFor } from './scaffold'
import { isRepoAddress, isValidCwd, isWebUrl, validateStackFields } from './stackValidation'

const vars = varsFor('Portale Web')
const stack = (s: Partial<Stack>): Stack => ({ ...structuredClone(EMPTY_STACK), ...s })
const step = (s: Partial<Stack['steps'][number]>) => ({ id: 's1', title: 'Passo', kind: 'command' as const, command: '', cwd: '', url: '', notes: '', ...s })

describe('controlli dei campi dello stack', () => {
  it('indirizzi web: con o senza protocollo, mai testo qualsiasi', () => {
    expect(isWebUrl('https://nodejs.org/download')).toBe(true)
    expect(isWebUrl('visualstudio.microsoft.com/downloads')).toBe(true)
    expect(isWebUrl('http://localhost:5173')).toBe(true)
    expect(isWebUrl('scarica da internet')).toBe(false)
    expect(isWebUrl('https://nodejs')).toBe(false)
    expect(isWebUrl('ftp://server/file')).toBe(false)
    expect(isWebUrl('https://nodejs.org/con spazi')).toBe(false)
  })

  it('gli indirizzi dei prerequisiti noti sono tutti validi', () => {
    for (const k of KNOWN_PREREQUISITES.filter((x) => x.url)) expect(isWebUrl(k.url), k.name).toBe(true)
  })

  it('repository: URL, forma git@, cartelle locali e di rete', () => {
    for (const ok of ['https://github.com/nisiix/todo-doto.git', 'git@github.com:nisiix/todo-doto.git', 'ssh://git@server/repo.git', 'github.com/nisiix/todo-doto', '\\\\server\\git\\progetto', 'Z:\\Git\\progetto', '/srv/git/progetto.git'])
      expect(isRepoAddress(ok), ok).toBe(true)
    for (const no of ['il mio repo', 'progetto', 'https://github', 'Z:\\Git\\pro|getto']) expect(isRepoAddress(no), no).toBe(false)
  })

  it('cartella di lavoro dei passi: relativa o assoluta, senza caratteri vietati', () => {
    expect(isValidCwd('src/app')).toBe(true)
    expect(isValidCwd('C:\\Progetti\\{{slug}}')).toBe(true)
    expect(isValidCwd('src:app')).toBe(false)
    expect(isValidCwd('cartella?')).toBe(false)
  })

  it('segnala ogni campo sbagliato con la sua chiave; i campi vuoti non sono errori', () => {
    const errors = validateStackFields(
      stack({
        repoUrl: 'il mio repo',
        prerequisites: [
          { id: 'p1', name: 'Node.js', version: '', url: 'nodejs.org', check: '' },
          { id: 'p2', name: 'Altro', version: '', url: 'pagina del fornitore', check: '' },
          { id: 'p3', name: '', version: '', url: '', check: '' },
        ],
        steps: [step({ id: 's1', cwd: 'a|b' }), step({ id: 's2', kind: 'link', url: 'non è un link' }), step({ id: 's3', kind: 'manual', url: 'ignorato' })],
        envVars: [
          { key: 'API_URL', example: '', notes: '' },
          { key: '1PORTA', example: '', notes: '' },
          { key: 'api_url', example: '', notes: '' },
          { key: '', example: 'x', notes: '' },
        ],
        files: [
          { id: 'f1', path: 'src/main.ts', content: '' },
          { id: 'f2', path: '../fuori.txt', content: '' },
          { id: 'f3', path: 'C:\\file.txt', content: '' },
          { id: 'f4', path: 'SRC\\main.ts', content: '' },
          { id: 'f5', path: 'nome?.txt', content: '' },
          { id: 'f6', path: '', content: 'scartato al salvataggio' },
        ],
      }),
      vars,
    )
    expect(Object.keys(errors).sort()).toEqual(
      ['repoUrl', 'prereq:p2:url', 'step:s1:cwd', 'step:s2:url', 'env:1:key', 'env:2:key', 'file:f2:path', 'file:f3:path', 'file:f4:path', 'file:f5:path'].sort(),
    )
    expect(errors['env:2:key']).toContain('già presente')
    expect(errors['file:f4:path']).toContain('già presente')
  })

  it('i segnaposto si controllano già sostituiti', () => {
    const s = stack({ repoUrl: 'https://github.com/nisiix/{{slug}}.git', files: [{ id: 'f1', path: '{{slug}}/README.md', content: '' }] })
    expect(validateStackFields(s, vars)).toEqual({})
    expect(validateStackFields(stack({}), vars)).toEqual({})
  })
})
