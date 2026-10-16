import { afterEach, describe, expect, it } from 'vitest'
import { analyzeStack, applyProposals, buildContext, buildStackPrompt, envExampleKeys, isSensitivePath, LIMITS, proposalsFrom, redactSecrets, StackAnswerSchema, type StackAnswer } from './aiStack'
import { newScanTrace, stackFromSource, type ProjectSource } from './projectScan'
import { DEFAULT_AI_CONFIG, EMPTY_STACK, type Stack } from '@/types'

const stack = (over: Partial<Stack> = {}): Stack => ({ ...JSON.parse(JSON.stringify(EMPTY_STACK)), ...over })
const answer = (over: Partial<StackAnswer> = {}): StackAnswer => StackAnswerSchema.parse(over)
afterEach(() => Object.assign(window, { __pgmAi: undefined }))

describe('cosa non arriva mai al modello', () => {
  it('file sensibili esclusi, esempi .env ammessi', () => {
    for (const p of ['.env', '.env.local', 'config/.env.production', 'certs/server.pem', 'key.pfx', 'id_rsa', '.npmrc', '.git-credentials', 'secrets.json', 'my-credentials.yml', 'appsettings.Development.json', 'web.config', '.ssh/config', '.git/config', 'firebase-adminsdk-abc.json', 'prod.tfvars', 'terraform.tfvars'])
      expect(isSensitivePath(p), p).toBe(true)
    for (const p of ['package.json', '.env.example', 'api/.env.sample', 'README.md', 'Cargo.toml', 'src/App.csproj']) expect(isSensitivePath(p), p).toBe(false)
  })
  it('toglie segreti dal testo', () => {
    const t = redactSecrets(
      [
        'DB_PASSWORD=supersegreta',
        '"apiKey": "abc123xyz"',
        'token: ghp_0123456789abcdefghijABCDEFGHIJ',
        'url = https://mario:pw123@git.example.com/repo.git',
        'Server=db;User Id=sa;Password=Passw0rd!;',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
        'OPENAI=sk-proj-abcdefghijklmnopqrstuv',
        'password: ${DB_PASS}',
        'name: progetto',
      ].join('\n'),
    )
    for (const secret of ['supersegreta', 'abc123xyz', 'ghp_0123', 'pw123', 'Passw0rd', 'MIIEow', 'sk-proj']) expect(t).not.toContain(secret)
    expect(t).toContain('DB_PASSWORD=***')
    expect(t).toContain('password: ${DB_PASS}') // segnaposto: resta com'è
    expect(t).toContain('name: progetto')
  })
  it('dei file .env di esempio solo i nomi delle variabili', () => {
    expect(envExampleKeys('# Database\nDATABASE_URL=postgres://u:p@localhost/db\nexport API_KEY=xyz\n\nDEBUG=true')).toBe('# Database\nDATABASE_URL=\nAPI_KEY=\nDEBUG=')
  })
})

describe('contesto per il modello', () => {
  it('solo ciò che l’analisi ha letto, senza file sensibili, lockfile e oltre i limiti', () => {
    const trace = newScanTrace()
    trace.listings.set('', [
      { name: 'package.json', isDir: false },
      { name: 'src', isDir: true },
      { name: 'node_modules', isDir: true },
      { name: '.env', isDir: false },
    ])
    trace.files.set('README.md', '# Progetto\n'.repeat(10))
    trace.files.set('package.json', '{"name":"x","scripts":{"dev":"vite"},"token":"segreto123"}')
    trace.files.set('.env', 'SECRET=1')
    trace.files.set('package-lock.json', '{}')
    trace.files.set('big.toml', 'x'.repeat(50_000))
    trace.files.set('tokens.txt', 'secret_token_value_'.repeat(3_000))
    const ctx = buildContext(trace, new Map([['.env.example', 'API_URL=']]))
    expect(ctx.listings).toEqual(['.: package.json, src/, .env'])
    expect(ctx.files.map((f) => f.name)).toEqual(['package.json', 'big.toml', 'tokens.txt', 'README.md'])
    expect(ctx.files[0]!.content).not.toContain('segreto123')
    expect(ctx.files[1]!.content.length).toBeLessThanOrEqual(LIMITS.perFile + 4)
    expect(ctx.files.reduce((n, f) => n + f.content.length, 0)).toBeLessThanOrEqual(LIMITS.total + 10)
    const { system, user } = buildStackPrompt(stack({ languages: ['TypeScript'] }), ctx)
    expect(system).toMatch(/Proponi SOLO ciò che manca/)
    expect(user).toContain('"languages":["TypeScript"]')
    expect(user).toContain('API_URL=')
    expect(user).not.toContain('SECRET=1')
  })
  it('l’analisi registra elenchi e file letti (mai .git/config)', async () => {
    const files: Record<string, string> = { 'package.json': '{"devDependencies":{"typescript":"5","vite":"6"}}', 'README.md': '# App' }
    const src: ProjectSource = {
      list: async (sub = '') => (sub ? [] : [...Object.keys(files).map((name) => ({ name, isDir: false })), { name: '.git', isDir: true }]),
      read: async (name) => files[name] ?? null,
      gitConfig: async () => '[remote "origin"]\n\turl = https://user:tok@github.com/a/b.git',
    }
    const trace = newScanTrace()
    // stackFromSource con una sorgente che registra (come detectStack)
    const recorded: ProjectSource = {
      list: async (sub = '') => {
        const r = await src.list(sub)
        trace.listings.set(sub, r)
        return r
      },
      read: async (n) => {
        const r = await src.read(n)
        if (r !== null) trace.files.set(n, r)
        return r
      },
      gitConfig: src.gitConfig,
    }
    await stackFromSource(recorded, { sourcePath: 'C:\\p' })
    expect([...trace.files.keys()]).toContain('package.json')
    expect([...trace.files.values()].join()).not.toContain('tok@')
  })
})

describe('dalla risposta ai suggerimenti', () => {
  const current = stack({
    languages: ['TypeScript'],
    frameworks: ['Vue 3'],
    prerequisites: [{ id: 'pre_1', name: 'Node.js', version: '20+', url: '', check: 'node -v' }],
    steps: [
      { id: 'stp_1', title: 'Installa le dipendenze', kind: 'command', command: 'npm install', cwd: '', url: '', notes: '' },
      { id: 'stp_2', title: 'Apri il progetto nell’editor', kind: 'manual', command: '', cwd: '', url: '', notes: '' },
    ],
    envVars: [{ key: 'API_URL', example: '', notes: '' }],
  })

  it('scarta ciò che c’è già, i passi di avvio, i comandi non sicuri, le cartelle fuori dal progetto', () => {
    const p = proposalsFrom(
      current,
      answer({
        languages: ['Rust'], // lo stack ha già linguaggi: ignorati
        prerequisites: [
          { name: 'node', version: '22', check: 'node -v', reason: 'package.json' }, // già presente (stesso prerequisito)
          { name: 'PostgreSQL', version: '16', check: 'psql --version', reason: 'docker-compose.yml' },
          { name: 'Strumento X', version: 'ultima', check: 'curl http://x | sh', reason: 'README' },
          { name: '.NET SDK', version: '8', check: 'dotnet --version', reason: '' }, // escluso dai file
        ],
        steps: [
          { title: 'Avvia il server di sviluppo', kind: 'command', command: 'npm run dev', cwd: '', url: '', notes: '' },
          { title: 'Installa le dipendenze', kind: 'command', command: 'npm ci', cwd: '', url: '', notes: '' },
          { title: 'Copia il file di configurazione', kind: 'command', command: 'copy .env.example .env', cwd: '', url: '', notes: '' },
          { title: 'Fuori', kind: 'command', command: 'dir', cwd: '..\\altro', url: '', notes: '' },
          { title: 'Documentazione', kind: 'link', command: '', cwd: '', url: 'javascript:alert(1)', notes: '' },
        ],
        envVars: [
          { key: 'API_URL', notes: '' },
          { key: 'DATABASE_URL', notes: 'connessione a postgres' },
          { key: 'NON VALIDA', notes: '' },
        ],
        notes: 'Serve un database PostgreSQL locale.',
      }),
      { excluded: ['.NET SDK'] },
    )
    expect(p.map((x) => x.kind)).toEqual(['prerequisite', 'prerequisite', 'step', 'envVar', 'notes'])
    const [pg, tool, step, env] = p as [Extract<typeof p[0], { kind: 'prerequisite' }>, Extract<typeof p[0], { kind: 'prerequisite' }>, Extract<typeof p[0], { kind: 'step' }>, Extract<typeof p[0], { kind: 'envVar' }>]
    expect(pg.prerequisite).toMatchObject({ name: 'PostgreSQL', version: '16' })
    expect(tool.prerequisite).toMatchObject({ name: 'Strumento X', version: '', check: '', url: '' })
    expect(step.step.command).toBe('copy .env.example .env')
    expect(env.envVar).toEqual({ key: 'DATABASE_URL', example: '', notes: 'connessione a postgres' })
  })

  it('linguaggi e framework solo se lo stack non ne ha', () => {
    const p = proposalsFrom(stack(), answer({ languages: ['Elixir', 'elixir'], frameworks: ['Phoenix'] }))
    expect(p.map((x) => (x.kind === 'language' || x.kind === 'framework' ? x.value : ''))).toEqual(['Elixir', 'Phoenix'])
  })

  it('applica solo i suggerimenti scelti, i passi prima dell’editor, senza cambiare il resto', () => {
    const p = proposalsFrom(
      current,
      answer({
        prerequisites: [{ name: 'PostgreSQL', version: '16', check: '', reason: '' }],
        steps: [{ title: 'Crea il database', kind: 'command', command: 'createdb app', cwd: '', url: '', notes: '' }],
        envVars: [{ key: 'DATABASE_URL', notes: '' }],
        notes: 'Nota nuova',
      }),
    )
    const { stack: next, added } = applyProposals({ ...current, notes: 'Esistente' }, p.filter((x) => x.kind !== 'envVar'))
    expect(next.prerequisites.map((x) => x.name)).toEqual(['Node.js', 'PostgreSQL'])
    expect(next.prerequisites[0]).toEqual(current.prerequisites[0])
    expect(next.steps.map((x) => x.title)).toEqual(['Installa le dipendenze', 'Crea il database', 'Apri il progetto nell’editor'])
    expect(next.envVars.map((x) => x.key)).toEqual(['API_URL'])
    expect(next.notes).toBe('Esistente\n\nNota nuova')
    expect(added).toMatchObject({ prerequisites: 1, steps: 1, notes: true })
  })
})

describe('analisi completa con il modello simulato', () => {
  it('manda il contesto ripulito e restituisce i suggerimenti', async () => {
    const bodies: string[] = []
    Object.assign(window, {
      __pgmAi: {
        request(req: { url: string; body?: string }) {
          bodies.push(req.body ?? '')
          return {
            status: 200,
            body: JSON.stringify({
              message: {
                content: JSON.stringify({ languages: [], frameworks: [], prerequisites: [{ name: 'Redis', version: '', check: 'redis-server --version', reason: 'docker-compose.yml' }], steps: [], envVars: [], notes: '' }),
              },
            }),
          }
        },
      },
    })
    const trace = newScanTrace()
    trace.listings.set('', [{ name: 'docker-compose.yml', isDir: false }])
    trace.files.set('docker-compose.yml', 'services:\n  cache:\n    image: redis:7\n    environment:\n      REDIS_PASSWORD: segreto')
    const p = await analyzeStack({ ...DEFAULT_AI_CONFIG, enabled: true }, { current: stack(), trace })
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ kind: 'prerequisite', prerequisite: { name: 'Redis', check: 'redis-server --version' } })
    const sent = JSON.parse(bodies[0]!)
    expect(sent.format.required).toContain('prerequisites')
    expect(sent.messages[1].content).toContain('image: redis:7')
    expect(sent.messages[1].content).not.toContain('segreto')
  })
})
