import { ref, watch, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { getFs } from '@/services/fs'
import { resolveStack, varsFor } from '@/services/scaffold'
import type { Project } from '@/types'

/** Cambia quando una cartella di progetto viene creata: tutte le viste ricontrollano. */
const changed = ref(0)

/**
 * Il progetto è collegato a una cartella locale? Sì se nello Stack è indicata
 * la cartella del progetto e questa esiste davvero sul disco. Si ricontrolla
 * quando cambia la cartella, quando se ne crea una e quando si torna sulla finestra.
 */
export function useProjectFolder(project: Ref<Project | null>) {
  const linked = ref(false)
  let seq = 0

  async function check() {
    const p = project.value
    const n = ++seq
    const dir = p ? resolveStack(p.stack, varsFor(p.name)).sourcePath.trim() : ''
    let ok = false
    if (dir) {
      try {
        ok = await (await getFs()).exists(dir)
      } catch {
        ok = false
      }
    }
    if (n === seq) linked.value = ok
  }

  watch(() => [project.value?.id, project.value?.stack.sourcePath, project.value?.name, changed.value], check, { immediate: true })
  useEventListener(window, 'focus', () => void check())
  /** Da chiamare dopo aver creato una cartella di progetto: aggiorna tutte le viste. */
  const refresh = () => void changed.value++
  return { linked, refresh }
}
