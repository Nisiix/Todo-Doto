import { computed, ref } from 'vue'
import dayjs from 'dayjs'

/**
 * Oggi (YYYY-MM-DD) e l'istante corrente, aggiornati ogni minuto e condivisi da
 * tutta l'app: con l'app aperta a cavallo della mezzanotte la vista «Oggi», le
 * attenzioni e l'inserimento rapido passano al giorno nuovo da soli.
 */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

export function useToday() {
  if (!timer && typeof window !== 'undefined') timer = setInterval(() => (now.value = Date.now()), 60_000)
  const today = computed(() => dayjs(now.value).format('YYYY-MM-DD'))
  const nowIso = computed(() => new Date(now.value).toISOString())
  return { today, nowIso }
}
