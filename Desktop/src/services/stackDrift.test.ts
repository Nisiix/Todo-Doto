import { describe, expect, it } from 'vitest'
import { getFs } from './fs'
import { detectStack } from './projectScan'
import { stackDrift } from './stackDrift'

describe('stack non aggiornato', () => {
  it('lo stack ricavato dai file non segnala nulla; quando i file cambiano, elenca le differenze', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/drift/app/package.json', JSON.stringify({ engines: { node: '>=18' }, dependencies: { vue: '^3.5.0' } }))
    const first = await detectStack('/drift/app')
    const saved = { ...first.stack, sourcePath: '/drift/app' }
    expect(stackDrift(saved, first)).toBeNull()

    // Il team porta il progetto a Node 22 e aggiunge Tailwind e Docker
    await fs.writeTextAtomic('/drift/app/package.json', JSON.stringify({ engines: { node: '>=22' }, dependencies: { vue: '^3.5.0' }, devDependencies: { tailwindcss: '^4' } }))
    await fs.writeTextAtomic('/drift/app/docker-compose.yml', 'services:\n  db:\n    image: postgres:16\n')
    const later = await detectStack('/drift/app')
    const d = stackDrift(saved, later)
    expect(d).not.toBeNull()
    expect(d!.changes.join('\n')).toMatch(/Node\.js .*18.* → .*22/)
    expect(d!.changes.join('\n')).toMatch(/Tailwind/i)
    expect(d!.next.sourcePath).toBe('/drift/app')
    // Dopo l'aggiornamento non resta nulla da segnalare
    expect(stackDrift(d!.next, later)).toBeNull()
  })
})
