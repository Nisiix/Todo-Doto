import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'warning' | 'error'
  action?: { label: string; run: () => void }
}

let toastSeq = 0

export const useUiStore = defineStore('ui', () => {
  // --- tema ---------------------------------------------------------------
  const theme = ref<Theme>((localStorage.getItem('pgm:theme') as Theme | null) ?? 'system')
  const media = matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  media.addEventListener('change', (e) => (systemDark.value = e.matches))
  const isDark = computed(() => (theme.value === 'system' ? systemDark.value : theme.value === 'dark'))

  watch(
    isDark,
    (d) => {
      document.documentElement.classList.toggle('dark', d)
      document.documentElement.style.colorScheme = d ? 'dark' : 'light'
    },
    { immediate: true },
  )

  function setTheme(t: Theme) {
    theme.value = t
    if (t === 'system') localStorage.removeItem('pgm:theme')
    else localStorage.setItem('pgm:theme', t)
  }
  const toggleTheme = () => setTheme(isDark.value ? 'light' : 'dark')

  // --- toast --------------------------------------------------------------
  const toasts = ref<Toast[]>([])
  function toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action'], ms = 3600) {
    const id = ++toastSeq
    toasts.value.push({ id, text, tone, action })
    if (ms > 0) setTimeout(() => dismissToast(id), ms)
    return id
  }
  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  // --- selezione / pannelli -------------------------------------------------
  const selectedItemId = ref<string | null>(null)
  const search = ref('')
  const railCollapsed = ref(false)
  /** id delle righe aggiornate da remoto: lampeggiano brevemente */
  const flash = ref(new Set<string>())
  function flashItems(ids: string[]) {
    ids.forEach((id) => flash.value.add(id))
    flash.value = new Set(flash.value)
    setTimeout(() => {
      ids.forEach((id) => flash.value.delete(id))
      flash.value = new Set(flash.value)
    }, 1600)
  }

  // --- impostazioni (apribili da qualunque punto, es. dal banner dell'IA locale) ---
  const settingsOpen = ref(false)
  const settingsTab = ref('general')
  function openSettings(tab = 'general') {
    settingsTab.value = tab
    settingsOpen.value = true
  }

  return {
    settingsOpen,
    settingsTab,
    openSettings,
    theme,
    isDark,
    setTheme,
    toggleTheme,
    toasts,
    toast,
    dismissToast,
    selectedItemId,
    search,
    railCollapsed,
    flash,
    flashItems,
  }
})
