import { describe, expect, it } from 'vitest'
import { planPcSetup } from './pcSetup'

const p = (id: string) => ({ id, name: id.toUpperCase() })
const miss = (name: string, required = '', status: 'missing' | 'outdated' = 'missing', found = '') => ({ name, required, status, found })

describe('configura questo PC per tutti i progetti', () => {
  it('lo stesso programma chiesto da più progetti si installa una volta, per la versione più alta', () => {
    const plan = planPcSetup([
      { project: p('a'), missing: [miss('node', '18+'), miss('Git')] },
      { project: p('b'), missing: [miss('Node.js', '24+'), miss('git')] },
      { project: p('c'), missing: [miss('Node.js', '')] },
    ])
    const node = plan.installs.filter((i) => i.name === 'Node.js')
    expect(node).toHaveLength(1)
    expect(node[0]!.plan.id).toBe('OpenJS.NodeJS') // 24+ → versione corrente, soddisfa anche 18+
    expect(node[0]!.projects.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(plan.installs.filter((i) => i.name === 'Git')).toHaveLength(1)
  })

  it('versioni che convivono (Python, JDK) si installano tutte; ciò che non si conosce va a mano', () => {
    const plan = planPcSetup([
      { project: p('a'), missing: [miss('Python', '3.11+'), miss('Programma interno XYZ', '2')] },
      { project: p('b'), missing: [miss('Python', '3.13+'), miss('Java JDK', '17')] },
      { project: p('c'), missing: [miss('Java JDK', '21')] },
    ])
    expect(plan.installs.filter((i) => i.name === 'Python').map((i) => i.plan.id).sort()).toEqual(['Python.Python.3.12', 'Python.Python.3.13'])
    expect(plan.installs.filter((i) => i.name === 'Java JDK').map((i) => i.plan.id).sort()).toEqual(['EclipseAdoptium.Temurin.17.JDK', 'EclipseAdoptium.Temurin.21.JDK'])
    expect(plan.manual.map((x) => x.name)).toEqual(['Programma interno XYZ'])
    expect(plan.manual[0]!.projects.map((x) => x.id)).toEqual(['a'])
  })

  it('niente da fare: piano vuoto', () => {
    expect(planPcSetup([{ project: p('a'), missing: [] }])).toEqual({ installs: [], manual: [] })
  })
})
