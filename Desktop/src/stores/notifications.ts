import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { nanoid } from 'nanoid'
import { saveConfig } from '@/services/config'
import { ensureDesktopPermission, showDesktopNotifications } from '@/services/desktopNotify'
import type { Change } from '@/services/changes'
import { useSessionStore } from './session'
import { NOTIFICATION_TYPES, type Notification, type NotificationType, type Project } from '@/types'

const MAX = 300

/**
 * Notifiche interne, per macchina. Vengono generate dalle modifiche remote ai
 * progetti di cui si fa parte (vedi workspace.refresh) e conservate in
 * localStorage per workspace+utente. Le preferenze (quali tipi ricevere) sono
 * nella configurazione locale.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const session = useSessionStore()
  const items = ref<Notification[]>([])
  const open = ref(false)
  let storageKey = ''

  const unread = computed(() => items.value.filter((n) => !n.read).length)
  const muted = computed(() => new Set(session.config.mutedNotifications))
  const isEnabled = (t: NotificationType) => !muted.value.has(t)

  function load(workspaceId: string, userId: string) {
    storageKey = `pgm:notif:${workspaceId}:${userId}`
    try {
      items.value = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Notification[]
    } catch {
      items.value = []
    }
  }
  function persist() {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(items.value.slice(0, MAX)))
    } catch {
      /* spazio esaurito o storage non disponibile: le notifiche restano in memoria */
    }
  }
  function clearSession() {
    items.value = []
    storageKey = ''
  }

  /** Trasforma le modifiche di un progetto in notifiche, rispettando le preferenze. */
  function ingest(project: Project, changes: Change[], meId: string | null) {
    const fresh: Notification[] = []
    for (const c of changes) {
      if (c.byId === meId) continue // le proprie azioni non si notificano
      const mentioned = meId !== null && c.mentions.includes(meId)
      const type: NotificationType = mentioned ? 'mention' : c.type
      if (!isEnabled(type) && !(mentioned && isEnabled('mention'))) continue
      fresh.push({
        id: nanoid(10),
        at: new Date().toISOString(),
        type,
        projectId: project.id,
        projectName: project.name,
        itemId: c.itemId,
        itemTitle: c.itemTitle,
        byId: c.byId,
        text: c.text,
        read: false,
      })
    }
    if (fresh.length) {
      items.value = [...fresh.reverse(), ...items.value].slice(0, MAX)
      persist()
      if (session.config.desktopNotifications) void showDesktopNotifications(fresh)
    }
    return fresh.length
  }

  /** Attiva/disattiva i toast di Windows; chiede il permesso al sistema quando serve. */
  async function setDesktop(enabled: boolean): Promise<boolean> {
    if (enabled && !(await ensureDesktopPermission())) return false
    session.config.desktopNotifications = enabled
    await saveConfig(session.config)
    return true
  }

  function markAllRead() {
    items.value = items.value.map((n) => (n.read ? n : { ...n, read: true }))
    persist()
  }
  function markRead(id: string) {
    const n = items.value.find((x) => x.id === id)
    if (n && !n.read) {
      n.read = true
      persist()
    }
  }
  function clear() {
    items.value = []
    persist()
  }

  async function setEnabled(type: NotificationType, enabled: boolean) {
    const set = new Set(session.config.mutedNotifications)
    enabled ? set.delete(type) : set.add(type)
    session.config.mutedNotifications = NOTIFICATION_TYPES.filter((t) => set.has(t))
    await saveConfig(session.config)
  }

  return { items, unread, open, isEnabled, load, clearSession, ingest, markAllRead, markRead, clear, setEnabled, setDesktop }
})
