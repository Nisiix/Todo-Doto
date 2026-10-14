import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseButton from './ui/BaseButton.vue'
import SegmentedControl from './ui/SegmentedControl.vue'
import UserAvatar from './ui/UserAvatar.vue'
import StatusSelect from './board/StatusSelect.vue'
import PrioritySelect from './board/PrioritySelect.vue'
import RichText from './detail/RichText.vue'
import MentionTextarea from './detail/MentionTextarea.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSessionStore } from '@/stores/session'

describe('componenti UI generici', () => {
  it('BaseButton applica variante e dimensione', () => {
    const w = mount(BaseButton, { props: { variant: 'primary', size: 'sm' }, slots: { default: 'Salva' } })
    expect(w.text()).toBe('Salva')
    expect(w.classes()).toContain('bg-accent')
    expect(w.classes()).toContain('h-7')
    expect(w.attributes('type')).toBe('button')
  })

  it('SegmentedControl emette il valore scelto e marca l’opzione attiva', async () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], 'onUpdate:modelValue': (v: string) => w.setProps({ modelValue: v }) },
    })
    const buttons = w.findAll('button')
    expect(buttons[0]!.attributes('aria-checked')).toBe('true')
    await buttons[1]!.trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['b'])
    await nextTick()
    expect(buttons[1]!.attributes('aria-checked')).toBe('true')
  })

  it('UserAvatar mostra le iniziali', () => {
    expect(mount(UserAvatar, { props: { name: 'Mario Rossi' } }).text()).toBe('MR')
    expect(mount(UserAvatar, { props: { name: 'mrossi' } }).text()).toBe('M')
    expect(mount(UserAvatar, { props: { name: '' } }).text()).toBe('?')
  })
})

describe('selettori di stato e priorità', () => {
  it('StatusSelect elenca i tre stati e propaga la scelta', async () => {
    const w = mount(StatusSelect, { props: { modelValue: 'da_valutare' } })
    const options = w.findAll('option').map((o) => o.text())
    expect(options).toEqual(['Da valutare', 'Da definire', 'Confermato'])
    await w.find('select').setValue('confermato')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['confermato'])
  })

  it('PrioritySelect colora il pallino con la priorità', () => {
    const w = mount(PrioritySelect, { props: { modelValue: 'immediata' } })
    expect(w.find('span span').classes()).toContain('bg-p-immediata')
    expect(w.findAll('option')).toHaveLength(4)
  })
})

describe('testo con menzioni', () => {
  async function withUsers() {
    await useSessionStore().init()
    const ws = useWorkspaceStore()
    await ws.create({ path: '/ws', name: 'T', mode: 'network', password: 'segreto1' })
    await ws.renameSelf('Mario Rossi')
    return ws
  }

  it('RichText evidenzia @menzioni e link', async () => {
    await withUsers()
    const w = mount(RichText, { props: { text: 'Chiedi a @Mario Rossi, vedi https://example.com ok' } })
    const mention = w.find('span.font-semibold')
    expect(mention.text()).toBe('@Mario Rossi')
    expect(w.find('a').attributes('href')).toBe('https://example.com')
    expect(w.text()).toContain('ok')
  })

  it('MentionTextarea propone gli utenti dopo @ e inserisce il nome scelto', async () => {
    await withUsers()
    const w = mount(MentionTextarea, { props: { modelValue: '', 'onUpdate:modelValue': (v: string) => w.setProps({ modelValue: v }) } })
    const ta = w.find('textarea')
    await ta.setValue('ciao @ma')
    ;(ta.element as HTMLTextAreaElement).setSelectionRange(8, 8)
    await ta.trigger('input')
    expect(w.findAll('li')).toHaveLength(1)
    expect(w.find('li').text()).toContain('Mario Rossi')
    await ta.trigger('keydown', { key: 'Enter' })
    const last = w.emitted('update:modelValue')?.at(-1)?.[0]
    expect(last).toBe('ciao @Mario Rossi ')
  })

  it('MentionTextarea invia con Invio e va a capo con Shift+Invio', async () => {
    await withUsers()
    const w = mount(MentionTextarea, { props: { modelValue: 'testo' } })
    await w.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(w.emitted('submit')).toBeUndefined()
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('submit')).toHaveLength(1)
  })
})

describe('gestione permessi dei progetti', () => {
  it('matrice progetti × utenti: filtro per progetto, «Tutti» e permessi per utente', async () => {
    const PermissionsDialog = (await import('./dialogs/PermissionsDialog.vue')).default
    await useSessionStore().init()
    const ws = useWorkspaceStore()
    await ws.create({ path: '/perm', name: 'Rete', mode: 'network', password: 'segreto1' })
    await ws.storage!.mutateUsers((f) => {
      f.users.push({ id: 'usr_b', username: 'b', hostname: 'PC2', displayName: 'Bea', role: 'member', createdAt: '' })
      f.users.push({ id: 'usr_c', username: 'c', hostname: 'PC3', displayName: 'Carlo', role: 'member', createdAt: '' })
    })
    await ws.refresh()
    const aperto = (await ws.createProject({ name: 'Aperto', description: '', folderId: null, members: [] }))!
    const riservato = (await ws.createProject({ name: 'Riservato', description: '', folderId: null, members: ['usr_b', ws.currentUser!.id] }))!
    await ws.refresh()
    expect(ws.visibleProjects.map((p) => p.name)).toEqual(['Aperto', 'Riservato'])

    const w = mount(PermissionsDialog, { props: { open: false }, attachTo: document.body })
    await w.setProps({ open: true })
    await nextTick()
    const box = (label: string) => document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    // Stato iniziale: "Aperto" visibile a tutti, "Riservato" solo a Bea
    expect(box('Tutti · Aperto').checked).toBe(true)
    expect(box('Carlo può vedere «Aperto»').checked).toBe(true)
    expect(box('Tutti · Riservato').checked).toBe(false)
    expect(box('Bea può vedere «Riservato»').checked).toBe(true)
    expect(box('Carlo può vedere «Riservato»').checked).toBe(false)

    // Togliere Carlo da "Aperto": diventa riservato a tutti gli altri; dare "Riservato" anche a Carlo
    box('Carlo può vedere «Aperto»').click()
    box('Carlo può vedere «Riservato»').click()
    await nextTick()
    expect(box('Tutti · Aperto').checked).toBe(false)
    expect(document.body.textContent).toContain('2 progetti modificati')

    // Filtro per progetto: una sola riga
    const select = document.body.querySelector<HTMLSelectElement>('#perm-filter')!
    select.value = riservato.id
    select.dispatchEvent(new Event('change'))
    await nextTick()
    expect(document.body.querySelectorAll('tr[data-project]')).toHaveLength(1)

    const save = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Salva')!
    save.click()
    await vi.waitFor(() => expect(ws.projects[aperto.id]!.members.sort()).toEqual(['usr_b', ws.currentUser!.id].sort()))
    expect(ws.projects[riservato.id]!.members.sort()).toEqual(['usr_b', 'usr_c', ws.currentUser!.id].sort())
    w.unmount()
  })
})
