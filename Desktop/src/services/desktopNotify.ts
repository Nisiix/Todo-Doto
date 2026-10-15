/**
 * Notifiche di sistema (toast di Windows) tramite il plugin notification di
 * Tauri. Opzionali (Impostazioni → Notifiche), fuori da Tauri non fanno nulla.
 */
import { isTauri } from './fs'
import type { Notification } from '@/types'

/** Chiede il permesso al sistema; true se concesso. */
export async function ensureDesktopPermission(): Promise<boolean> {
  if (!isTauri) return false
  try {
    const n = await import('@tauri-apps/plugin-notification')
    if (await n.isPermissionGranted()) return true
    return (await n.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Mostra al massimo `max` toast per un gruppo di notifiche appena ricevute. */
export async function showDesktopNotifications(items: Notification[], max = 3) {
  if (!isTauri || !items.length) return
  try {
    const n = await import('@tauri-apps/plugin-notification')
    if (!(await n.isPermissionGranted())) return
    const shown = items.slice(0, max)
    for (const it of shown) n.sendNotification({ title: it.projectName, body: it.itemTitle ? `${it.itemTitle}: ${it.text}` : it.text })
    if (items.length > max) n.sendNotification({ title: 'Project Goal Manager', body: `… e altre ${items.length - max} novità` })
  } catch {
    /* il sistema può rifiutare: le notifiche interne restano */
  }
}
