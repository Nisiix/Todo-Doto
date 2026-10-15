import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { getActivePinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useSessionStore } from './stores/session'
import { useWorkspaceStore } from './stores/workspace'
import { saveConfig } from './services/config'

describe('avvio con "riapri l’ultimo workspace"', () => {
  it('apre direttamente il workspace: la scelta del workspace non compare mai', async () => {
    // Un workspace già usato, poi chiuso: è il primo dei recenti
    const session = useSessionStore()
    await session.init()
    const ws = useWorkspaceStore()
    expect((await ws.create({ path: '/avvio', name: 'Avvio', mode: 'local' })).ok).toBe(true)
    await ws.close()
    session.config.reopenLast = true
    await saveConfig(session.config)

    await router.push('/')
    await router.isReady()
    // Ogni pagina mostrata durante l'avvio
    const seen: string[] = []
    const stop = router.afterEach((to) => void seen.push(String(to.name)))
    const app = mount(App, { global: { plugins: [router, getActivePinia()!] }, attachTo: document.body })
    // Durante l'apertura: solo la schermata di avvio, mai la scelta del workspace
    expect(app.find('[data-starting]').exists()).toBe(true)
    let flashed = false
    const watcher = new MutationObserver(() => void (document.body.textContent?.includes('Crea workspace') && (flashed = true)))
    watcher.observe(document.body, { childList: true, subtree: true, characterData: true })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('workspace-home'), { timeout: 5000 })
    await flushPromises()
    expect(ws.status).toBe('open')
    expect(seen).toEqual(['workspace-home'])
    // La pagina di scelta del workspace non è mai stata mostrata, nemmeno per un attimo
    watcher.disconnect()
    expect(flashed).toBe(false)
    expect(document.body.textContent).not.toContain('Crea workspace')
    stop()
    app.unmount()
  })
})
