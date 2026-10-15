import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { nanoid } from 'nanoid'
import { saveConfig } from '@/services/config'
import type { Change } from '@/services/changes'
import { useSessionStore } from './session'
import { NOTIFICATION_TYPES, type AuditEntry, type Notification, type NotificationType, type Project } from '@/types'
import { common } from '@/i18n/common'

const MAX = 300
/** Chiavi ricordate (per non ricreare notizie già ricevute, anche se eliminate). */
const MAX_KEYS = 2000

/**
 * Notifiche interne, per macchina, conservate in localStorage per workspace+utente.
 * Due sorgenti, complementari:
 * - a workspace aperto, le modifiche remote ai progetti (diffProjects in
 *   workspace.refresh): coprono tutto, domande e commenti compresi;
 * - all'apertura, la cronologia condivisa (audit.json) per ciò che è successo
 *   mentre si era offline: copre le operazioni sugli elementi (creato,
 *   completato, cestinato…), che sono le uniche registrate lì.
 * Le preferenze (quali tipi ricevere) sono nella configurazione locale.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const session = useSessionStore()
  const items = ref<Notification[]>([])
  const open = ref(false)
  let storageKey = ''
  let seenKey = ''
  let keysKey = ''
  /** Chiavi delle notizie già trasformate in notifica (lette, non lette o eliminate). */
  let keys = new Set<string>()
  /** Ultimo istante in cui questo utente ha visto il workspace aggiornato (ISO). */
  let lastSeen = ''

  const unread = computed(() => items.value.filter((n) => !n.read).length)
  const muted = computed(() => new Set(session.config.mutedNotifications))
  const isEnabled = (t: NotificationType) => !muted.value.has(t)

  function load(workspaceId: string, userId: string) {
    storageKey = `pgm:notif:${workspaceId}:${userId}`
    seenKey = `pgm:notif-seen:${workspaceId}:${userId}`
    keysKey = `pgm:notif-keys:${workspaceId}:${userId}`
    try {
      items.value = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Notification[]
      lastSeen = localStorage.getItem(seenKey) ?? ''
      keys = new Set(JSON.parse(localStorage.getItem(keysKey) ?? '[]') as string[])
    } catch {
      items.value = []
      lastSeen = ''
      keys = new Set()
    }
    for (const n of items.value) keys.add(n.key ?? n.id)
  }
  /** Da chiamare a ogni aggiornamento riuscito: tutto ciò che è prima di "ora" è stato visto. */
  function touchSeen(at = new Date().toISOString()) {
    lastSeen = at
    if (!seenKey) return
    try {
      localStorage.setItem(seenKey, at)
    } catch {
      /* ignorato */
    }
  }
  function persist() {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(items.value.slice(0, MAX)))
      localStorage.setItem(keysKey, JSON.stringify([...keys].slice(-MAX_KEYS)))
    } catch {
      /* spazio esaurito o storage non disponibile: le notifiche restano in memoria */
    }
  }
  function clearSession() {
    items.value = []
    storageKey = ''
    seenKey = ''
    keysKey = ''
    keys = new Set()
    lastSeen = ''
  }

  /**
   * Aggiunge notifiche nuove scartando quelle la cui chiave è già nota: una
   * notizia già ricevuta non torna mai "nuova", anche se nel frattempo la
   * notifica è stata letta o eliminata.
   */
  function add(list: Notification[]) {
    const fresh = list.filter((n) => {
      const k = n.key ?? n.id
      if (keys.has(k)) return false
      keys.add(k)
      return true
    })
    if (fresh.length) {
      items.value = [...fresh, ...items.value].slice(0, MAX)
      persist()
    }
    return fresh.length
  }

  /** Notifica dell'app (non di un collega), con chiave di deduplica. */
  function notifySystem(n: Omit<Notification, 'id' | 'at' | 'read' | 'byId'> & { key: string }) {
    if (!isEnabled(n.type)) return 0
    return add([{ ...n, id: nanoid(10), at: new Date().toISOString(), byId: '', read: false }])
  }
  /** Dimentica le chiavi che iniziano con `prefix`: la notizia potrà essere notificata di nuovo. */
  function forgetKeys(prefix: string) {
    let changed = false
    for (const k of keys) if (k.startsWith(prefix)) changed = keys.delete(k) || changed
    if (changed) persist()
  }

  /** Mappa azione della cronologia → tipo di notifica e testo. */
  const AUDIT_TO_NOTIFICATION: Partial<Record<AuditEntry['action'], { type: NotificationType; text: string }>> = {
    item_created: { type: 'item_created', text: common.activity.created },
    item_completed: { type: 'item_completed', text: common.activity.completed },
    item_reopened: { type: 'item_completed', text: common.activity.reopened },
    item_trashed: { type: 'item_trashed', text: common.activity.trashed },
    item_restored: { type: 'item_trashed', text: common.activity.restored },
  }

  /**
   * All'apertura del workspace: trasforma in notifiche le operazioni registrate
   * nella cronologia da altri utenti dopo l'ultima volta che si è stati online,
   * sui progetti di cui si fa parte. Idempotente (l'id deriva dalla voce di audit).
   */
  function ingestAudit(entries: AuditEntry[], meId: string | null, canSee: (projectId: string) => boolean) {
    if (!lastSeen) {
      // Prima apertura su questa macchina: niente da recuperare, si parte da ora.
      touchSeen()
      return 0
    }
    const known = new Set(items.value.map((n) => n.id))
    const fresh: Notification[] = []
    for (const e of entries) {
      if (e.at <= lastSeen || e.userId === meId || !e.itemId || !canSee(e.projectId)) continue
      const map = AUDIT_TO_NOTIFICATION[e.action]
      if (!map || !isEnabled(map.type)) continue
      const id = `aud:${e.id}`
      if (known.has(id)) continue
      fresh.push({ id, key: id, at: e.at, type: map.type, projectId: e.projectId, projectName: e.projectName, itemId: e.itemId, itemTitle: e.itemTitle ?? '', byId: e.userId, text: map.text, read: false })
    }
    const n = add(fresh.sort((a, b) => b.at.localeCompare(a.at)))
    touchSeen()
    return n
  }

  /** Trasforma le modifiche di un progetto in notifiche, rispettando le preferenze. */
  function ingest(project: Project, changes: Change[], meId: string | null) {
    const fresh: Notification[] = []
    for (const c of changes) {
      if (c.byId === meId) continue // le proprie azioni non si notificano
      const mentioned = meId !== null && c.mentions.includes(meId)
      let type: NotificationType
      if (c.type === 'assigned') {
        if (!mentioned) continue // l'assegnazione interessa solo l'assegnatario
        type = 'assigned'
      } else type = mentioned ? 'mention' : c.type
      if (!isEnabled(type) && !(mentioned && type !== 'assigned' && isEnabled('mention'))) continue
      fresh.push({
        id: nanoid(10),
        // Stessa versione del progetto, stesso tipo, stesso elemento e testo: è la stessa notizia
        key: `chg:${project.id}:${project.version}:${type}:${c.itemId}:${c.byId}:${c.text.length}`,
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
    return add(fresh.reverse())
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
  /** Elimina una notifica (la notizia resta "nota": non ricompare). */
  function remove(id: string) {
    items.value = items.value.filter((n) => n.id !== id)
    persist()
  }
  /** Elimina tutte le notifiche (le notizie restano "note": non ricompaiono). */
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

  return { items, unread, open, isEnabled, load, touchSeen, clearSession, ingest, ingestAudit, notifySystem, forgetKeys, markAllRead, markRead, remove, clear, setEnabled }
})
