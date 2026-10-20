import { computed, ref, watch, type Ref } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { parseQuickAdd, tokenText, type QuickAddResult, type QuickToken } from '@/services/quickAdd'
import { useToday } from './useToday'
import { locale } from '@/i18n'

/**
 * Comandi dell'inserimento rapido (!priorità @utente #etichetta entro venerdì)
 * riconosciuti nel testo, con gli utenti e le etichette del workspace.
 * `keep(token)` lascia quel comando nel titolo; svuotando il testo si riparte.
 */
export function useQuickAdd(text: Readonly<Ref<string>>) {
  const ws = useWorkspaceStore()
  const { today } = useToday()
  const ignore = ref<string[]>([])
  watch(text, (t) => {
    if (!t.trim()) ignore.value = []
  })
  const parsed = computed<QuickAddResult>(() =>
    parseQuickAdd(text.value, {
      users: ws.users,
      labels: ws.tree.labels,
      meId: ws.currentUser?.id ?? null,
      today: today.value,
      dayFirst: locale === 'it',
      ignore: ignore.value,
    }),
  )
  const keep = (t: QuickToken) => void ignore.value.push(tokenText(text.value, t))
  return { parsed, keep }
}
