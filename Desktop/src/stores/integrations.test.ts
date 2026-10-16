import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { getActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { useWorkspaceStore } from './workspace'
import { useDriveStore } from './drive'
import { useGitHubStore } from './github'
import { router } from '@/router'
import { DriveClient } from '@/services/drive'
import type { DriveNode } from '@/types'

/** Workspace di rete aperto da un amministratore; `demote` lo fa diventare membro (da un altro admin, sul disco). */
async function networkWorkspace() {
  await useSessionStore().init()
  const ws = useWorkspaceStore()
  expect((await ws.create({ path: '/rete/int', projectsPath: '/rete/progetti', name: 'Rete', mode: 'network', password: 'segreto1' })).ok).toBe(true)
  const demote = async (role: 'member' | 'cleaner' = 'member') => {
    const me = ws.currentUser!
    await ws.storage!.mutateUsers((f) => void (f.users.find((u) => u.id === me.id)!.role = role))
    await ws.refresh()
    expect(ws.isAdmin).toBe(false)
  }
  return { ws, demote }
}

describe('GitHub nei workspace di rete: il token lo imposta solo un amministratore', () => {
  it('un membro o un cleaner non può collegare GitHub e non vede il pulsante', async () => {
    const { ws, demote } = await networkWorkspace()
    const gh = useGitHubStore()
    await gh.init()
    await demote('cleaner')
    await expect(gh.connect('github_pat_prova')).rejects.toThrow('Solo un amministratore può collegare GitHub.')
    expect(gh.connected).toBe(false)

    const TopBar = (await import('@/components/layout/TopBar.vue')).default
    const GitHubView = (await import('@/views/GitHubView.vue')).default
    await router.push('/w')
    const bar = mount(TopBar, { global: { plugins: [router, getActivePinia()!] } })
    expect(bar.text()).toContain('Drive')
    expect(bar.text()).not.toContain('GitHub')
    const view = mount(GitHubView, { global: { plugins: [router, getActivePinia()!] } })
    await flushPromises()
    expect(view.find('[data-github-admin-only]').exists()).toBe(true)
    expect(view.find('#gh-token').exists()).toBe(false)
    bar.unmount()
    view.unmount()
    expect(ws.isNetwork).toBe(true)
  })

  it('un amministratore vede il pulsante e il modulo del token', async () => {
    await networkWorkspace()
    const TopBar = (await import('@/components/layout/TopBar.vue')).default
    const GitHubView = (await import('@/views/GitHubView.vue')).default
    await router.push('/w')
    const bar = mount(TopBar, { global: { plugins: [router, getActivePinia()!] } })
    expect(bar.text()).toContain('GitHub')
    const view = mount(GitHubView, { global: { plugins: [router, getActivePinia()!] } })
    await flushPromises()
    expect(view.find('#gh-token').exists()).toBe(true)
    bar.unmount()
    view.unmount()
  })
})

describe('Google Drive: client condiviso dall’amministratore, account di ciascuno', () => {
  it('l’amministratore imposta il client per tutto il workspace; gli altri collegano solo il proprio account', async () => {
    const { ws, demote } = await networkWorkspace()
    const drive = useDriveStore()
    await drive.init()
    expect(drive.status).toBe('unconfigured')
    await drive.configure('123-abc.apps.googleusercontent.com', 'segreto-app-desktop')
    expect(ws.drive.oauthClientId).toBe('123-abc.apps.googleusercontent.com')
    expect(drive.status).toBe('disconnected')
    expect(drive.sharedClient).toBe(true)
    // Riaprendo, il client arriva dal workspace (un altro PC non deve configurare nulla)
    const saved = await ws.storage!.readDrive()
    expect(saved.oauthClientId).toBe('123-abc.apps.googleusercontent.com')

    // Drive simulato: l'amministratore vede due file, il membro solo quello a cui ha accesso
    const file = (id: string, name: string): DriveNode => ({ id, name, parentId: null, mimeType: 'application/pdf', size: 10, modifiedTime: '2026-10-16T10:00:00Z', webViewLink: null })
    let visible = [file('f1', 'Contratto.pdf'), file('f2', 'Bilancio.pdf')]
    vi.spyOn(DriveClient.prototype, 'folderInfo').mockImplementation(async (id: string) => ({ id, name: 'Documenti', mimeType: 'application/vnd.google-apps.folder' }))
    vi.spyOn(DriveClient.prototype, 'walkFolder').mockImplementation(async () => visible)
    await drive.setRootFolder('https://drive.google.com/drive/folders/abcdefghijklmnop')
    expect(ws.drive.nodes.map((n) => n.name)).toEqual(['Contratto.pdf', 'Bilancio.pdf'])
    expect(drive.personalView).toBe(false)

    // Un membro: niente scelta né rimozione della cartella...
    await demote()
    await expect(drive.setRootFolder('https://drive.google.com/drive/folders/zzzzzzzzzzzzzzzz')).rejects.toThrow('Solo un amministratore')
    await drive.clearRootFolder()
    expect(ws.drive.rootFolderId).toBe('abcdefghijklmnop')
    // ...ma risincronizza, per sé: vede i file a cui ha accesso, il workspace non cambia
    visible = [file('f1', 'Contratto.pdf')]
    await drive.sync()
    expect(drive.personalView).toBe(true)
    expect(drive.nodes.map((n) => n.name)).toEqual(['Contratto.pdf'])
    expect(ws.drive.nodes.map((n) => n.name)).toEqual(['Contratto.pdf', 'Bilancio.pdf'])
    expect((await ws.storage!.readDrive()).nodes).toHaveLength(2)
    // Il client del workspace resta (la struttura sincronizzata non lo cancella)
    expect(ws.drive.oauthClientId).toBe('123-abc.apps.googleusercontent.com')
    vi.restoreAllMocks()
  })
})
