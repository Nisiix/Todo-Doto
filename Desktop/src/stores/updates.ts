import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkForUpdate, type AvailableUpdate } from '@/services/updater'
import { t } from '@/i18n'
import { useUiStore } from './ui'

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'installing' | 'error'

/**
 * Stato degli aggiornamenti: controllo all'avvio (silenzioso) e da
 * Impostazioni → Informazioni, installazione con avanzamento.
 */
export const useUpdatesStore = defineStore('updates', () => {
  const ui = useUiStore()

  const status = ref<UpdateStatus>('idle')
  const update = ref<AvailableUpdate | null>(null)
  const error = ref('')
  const progress = ref(0)
  const checkedAt = ref<string | null>(null)


  async function check(silent = false) {
    if (status.value === 'checking' || status.value === 'installing') return
    status.value = 'checking'
    error.value = ''
    const r = await checkForUpdate()
    checkedAt.value = new Date().toISOString()
    if (r.status === 'error') {
      status.value = 'error'
      error.value = r.message
      if (!silent) ui.toast(t('Controllo aggiornamenti non riuscito: {error}', { error: r.message }), 'warning', undefined, 6000)
      return
    }
    if (r.status === 'none') {
      update.value = null
      status.value = 'none'
      if (!silent) ui.toast(t('Hai già la versione più recente.'), 'success')
      return
    }
    update.value = r.update
    status.value = 'available'
    if (silent) {
      ui.toast(t('Disponibile la versione {version}.', { version: r.update.version }), 'info', { label: t('Installa'), run: () => void install() }, 12_000)
    }
  }

  async function install() {
    if (!update.value || status.value === 'installing') return
    status.value = 'installing'
    progress.value = 0
    try {
      await update.value.install((f) => (progress.value = f))
    } catch (e) {
      status.value = 'error'
      error.value = e instanceof Error ? e.message : String(e)
      ui.toast(t('Installazione non riuscita: {error}', { error: error.value }), 'error', undefined, 8000)
    }
  }

  return { status, update, error, progress, checkedAt, check, install }
})
