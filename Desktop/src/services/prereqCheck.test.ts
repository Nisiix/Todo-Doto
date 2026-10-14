import { describe, expect, it } from 'vitest'
import {
  blocksAutoSetup,
  compareVersions,
  currentOs,
  interpretCheck,
  isSafeCheck,
  matchVersion,
  parseRequirement,
  parseVersion,
  planCheck,
  precheck,
  type CheckPlan,
} from './prereqCheck'
import { parseGitHubRepo } from './github'

const plan = (over: Partial<CheckPlan> = {}): CheckPlan => ({ command: 'node -v', trusted: true, probe: false, os: [], ...over })
const run = (code: number | null, stdout = '', stderr = '', timedOut = false) => ({ code, stdout, stderr, timedOut })

describe('parseVersion', () => {
  it.each([
    ['v20.11.0', '20.11.0'],
    ['Python 3.12.1', '3.12.1'],
    ['git version 2.45.1.windows.1', '2.45.1'],
    ['go version go1.22.0 windows/amd64', '1.22.0'],
    ['openjdk version "17.0.8" 2023-07-18', '17.0.8'],
    ['cargo 1.79.0 (ffa9cf99a 2024-06-03)', '1.79.0'],
    ['psql (PostgreSQL) 16.1', '16.1'],
    ['Docker version 26.1.1, build 4cf5afa', '26.1.1'],
    ['2022', '2022'],
    ['nessuna versione', ''],
  ])('%s → %s', (text, v) => expect(parseVersion(text)).toBe(v))

  it('usa il modello dedicato se c’è', () => {
    expect(parseVersion('{ "name": "Android Studio", "version": "2024.1" }', /"version"\s*:\s*"([\d.]+)"/)).toBe('2024.1')
  })
})

describe('requisiti di versione', () => {
  it('interpreta le forme comuni', () => {
    expect(parseRequirement('')).toEqual({ kind: 'any' })
    expect(parseRequirement('stable')).toEqual({ kind: 'any' })
    expect(parseRequirement('LTS')).toEqual({ kind: 'any' })
    expect(parseRequirement('20+')).toEqual({ kind: 'min', v: '20' })
    expect(parseRequirement('>= 3.11')).toEqual({ kind: 'min', v: '3.11' })
    expect(parseRequirement('3.11 o superiore')).toEqual({ kind: 'min', v: '3.11' })
    expect(parseRequirement('^18.2')).toEqual({ kind: 'caret', v: '18.2' })
    expect(parseRequirement('~1.4')).toEqual({ kind: 'tilde', v: '1.4' })
    expect(parseRequirement('< 3')).toEqual({ kind: 'max', v: '3', inclusive: false })
    expect(parseRequirement('16 - 20')).toEqual({ kind: 'range', min: '16', max: '20' })
    expect(parseRequirement('20.x')).toEqual({ kind: 'exact', v: '20' })
    expect(parseRequirement('2022 (Desktop development with C++)')).toEqual({ kind: 'exact', v: '2022' })
  })

  it('confronta le versioni', () => {
    expect(compareVersions('20.11.0', '20')).toBe(1)
    expect(compareVersions('20.11.0', '20', 1)).toBe(0)
    expect(compareVersions('1.9', '1.10')).toBe(-1)
  })

  it('decide se la versione installata va bene', () => {
    expect(matchVersion('20.11.0', '20+')).toBe('ok')
    expect(matchVersion('18.19.0', '20+')).toBe('outdated')
    expect(matchVersion('3.11.4', '3.11')).toBe('ok')
    expect(matchVersion('3.12.1', '3.11')).toBe('different')
    expect(matchVersion('3.10.0', '3.11')).toBe('outdated')
    expect(matchVersion('18.3.0', '^18.2')).toBe('ok')
    expect(matchVersion('19.0.0', '^18.2')).toBe('different')
    expect(matchVersion('18', '16 - 20')).toBe('ok')
    expect(matchVersion('22.1', '16 - 20')).toBe('different')
    expect(matchVersion('2.9', '< 3')).toBe('ok')
    expect(matchVersion('8.0.100', 'qualsiasi')).toBe('ok')
  })
})

describe('sicurezza dei comandi', () => {
  it.each(['node -v', 'git --version', 'go version', 'java -version', 'sqlcmd -?', 'dotnet --version', 'pnpm -v'])('%s parte da solo', (c) =>
    expect(isSafeCheck(c)).toBe(true),
  )
  it.each(['node', 'node -e "require(1)"', 'del --version', 'npm -v && del x', 'C:\\tools\\x.exe -v', 'powershell -v', 'curl --version', 'node -v | more', 'echo %PATH%'])(
    '%s richiede conferma',
    (c) => expect(isSafeCheck(c)).toBe(false),
  )

  it('sceglie il comando: stack, catalogo o controllo dedicato', () => {
    expect(planCheck({ name: 'Node.js', check: '' }, 'windows')).toMatchObject({ command: 'node -v', trusted: true, probe: false })
    expect(planCheck({ name: 'Node.js', check: 'node -v && echo ok' }, 'windows')).toMatchObject({ trusted: false })
    expect(planCheck({ name: 'Visual Studio Build Tools', check: '' }, 'windows')).toMatchObject({ trusted: true, probe: true })
    expect(planCheck({ name: 'Visual Studio Build Tools', check: '' }, 'linux').command).toBe('')
    expect(planCheck({ name: 'Strumento interno', check: '' }, 'windows').command).toBe('')
    expect(planCheck({ name: 'Xcode', check: '' }, 'windows').os).toEqual(['macos'])
  })

  it('esiti senza eseguire nulla', () => {
    const opts = { desktop: true, confirmed: false }
    expect(precheck(plan({ os: ['macos'] }), 'windows', opts)?.status).toBe('otherOs')
    expect(precheck(plan({ command: '' }), 'windows', opts)?.status).toBe('manual')
    expect(precheck(plan(), 'windows', { desktop: false, confirmed: false })?.status).toBe('unavailable')
    expect(precheck(plan({ trusted: false }), 'windows', opts)?.status).toBe('confirm')
    expect(precheck(plan({ trusted: false }), 'windows', { desktop: true, confirmed: true })).toBeNull()
    expect(precheck(plan(), 'windows', opts)).toBeNull()
  })

  it('riconosce il sistema operativo', () => {
    expect(currentOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(currentOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('macos')
    expect(currentOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })
})

describe('interpretCheck', () => {
  it('installato e conforme', () => {
    expect(interpretCheck(run(0, 'v20.11.0\r\n'), plan(), '20+')).toMatchObject({ status: 'ok', version: '20.11.0' })
  })
  it('versione vecchia', () => {
    expect(interpretCheck(run(0, 'v18.19.0'), plan(), '20+').status).toBe('outdated')
  })
  it('versione stampata su stderr (java)', () => {
    expect(interpretCheck(run(0, '', 'openjdk version "21.0.2"'), plan(), '17+')).toMatchObject({ status: 'ok', version: '21.0.2' })
  })
  it('comando non riconosciuto (cmd 9009, sh 127, messaggio in italiano)', () => {
    expect(interpretCheck(run(9009, '', "'node' is not recognized as an internal or external command"), plan(), '').status).toBe('missing')
    expect(interpretCheck(run(127, '', 'sh: node: command not found'), plan(), '').status).toBe('missing')
    expect(interpretCheck(run(1, '', "'node' non è riconosciuto come comando interno o esterno"), plan(), '').status).toBe('missing')
  })
  it('alias di Python del Microsoft Store', () => {
    expect(interpretCheck(run(9009, '', 'Python was not found; run without arguments to install from the Microsoft Store'), plan(), '3.11+').status).toBe('missing')
  })
  it('uscita diversa da 0 ma versione stampata: installato', () => {
    expect(interpretCheck(run(1, 'tool 2.1.0'), plan(), '2+').status).toBe('ok')
  })
  it('errore senza versione: incerto', () => {
    expect(interpretCheck(run(1, '', 'Errore di configurazione'), plan(), '').status).toBe('failed')
  })
  it('installato ma senza versione leggibile', () => {
    expect(interpretCheck(run(0, 'ok'), plan(), '20+').status).toBe('installed')
    expect(interpretCheck(run(0, 'ok'), plan(), '').status).toBe('ok')
  })
  it('timeout e mancato avvio', () => {
    expect(interpretCheck(run(null, '', '', true), plan(), '').status).toBe('timeout')
    expect(interpretCheck({ ...run(null), spawnError: 'cmd mancante' }, plan(), '').status).toBe('failed')
  })
  it('controllo dedicato: output vuoto o errore = non installato', () => {
    const probe = plan({ probe: true })
    expect(interpretCheck(run(0, ''), probe, '2022').status).toBe('missing')
    expect(interpretCheck(run(1, '', 'Impossibile trovare il file specificato.'), probe, '').status).toBe('missing')
    expect(interpretCheck(run(0, '2022\r\n'), probe, '2022 (Desktop development with C++)').status).toBe('ok')
  })
})

describe('blocco della configurazione automatica', () => {
  it('blocca se manca, è da aggiornare o è incerto e non confermato', () => {
    expect(blocksAutoSetup('ok', false)).toBe(false)
    expect(blocksAutoSetup('otherOs', false)).toBe(false)
    expect(blocksAutoSetup('missing', true)).toBe(true)
    expect(blocksAutoSetup('outdated', true)).toBe(true)
    for (const s of ['installed', 'different', 'failed', 'timeout', 'manual', 'confirm', 'unavailable', undefined] as const) {
      expect(blocksAutoSetup(s, false)).toBe(true)
      expect(blocksAutoSetup(s, true)).toBe(false)
    }
  })
})

describe('parseGitHubRepo', () => {
  it.each([
    ['https://github.com/Nisiix/Project-goal-manager', 'Nisiix', 'Project-goal-manager'],
    ['https://github.com/Nisiix/Project-goal-manager.git', 'Nisiix', 'Project-goal-manager'],
    ['git@github.com:owner/repo.git', 'owner', 'repo'],
    ['owner/repo', 'owner', 'repo'],
  ])('%s', (url, owner, repo) => expect(parseGitHubRepo(url)).toEqual({ owner, repo }))
  it('rifiuta ciò che non è un repository', () => {
    expect(parseGitHubRepo('https://gitlab.com/a/b/c')).toBeNull()
    expect(parseGitHubRepo('\\\\server\\git\\progetto')).toBeNull()
  })
})
