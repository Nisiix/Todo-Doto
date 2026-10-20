import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { useWorkspaceStore } from './workspace'
import { useSessionStore } from './session'
import { getFs } from '@/services/fs'
import { buildIcs, icsFileName, personalEvents, projectEvents } from '@/services/ics'
import { defineMessages } from '@/i18n'

const m = defineMessages({
  it: { milestone: (n: string) => `Tappa ${n}`, personal: (n: string) => `Scadenze di ${n}`, project: (n: string) => `Scadenze · ${n}` },
  en: { milestone: (n: string) => `Milestone ${n}`, personal: (n: string) => `${n}’s due dates`, project: (n: string) => `Due dates · ${n}` },
})

import { FILES } from '@/services/storage'

/** Cartella dei calendari dentro la cartella Dati del workspace. */
export const CALENDARS_DIR = FILES.calendarsDir

/**
 * Calendari .ics delle scadenze nella cartella Dati: uno per la persona che usa
 * questo PC e uno per ogni progetto visibile. Si attivano per PC; si
 * aggiornano da soli pochi secondi dopo una modifica, e un file si riscrive
 * solo se il contenuto cambia. Mai con i dati cifrati: i calendari sarebbero
 * in chiaro nella cartella condivisa.
 */
export const useCalendarStore = defineStore('calendars', () => {
  const ws = useWorkspaceStore()
  const session = useSessionStore()

  const blocked = computed(() => !!ws.meta?.encryption)
  const enabled = computed(() => !!ws.meta && !blocked.value && !!session.config.calendars[ws.meta.id])
  async function setEnabled(on: boolean) {
    if (!ws.meta) return
    session.config.calendars = { ...session.config.calendars, [ws.meta.id]: on }
    await session.saveConfig()
    if (on) await writeAll()
  }

  /** Contenuto dei file: nome → testo .ics. */
  const files = computed<Record<string, string>>(() => {
    const me = ws.currentUser
    if (!me) return {}
    const out: Record<string, string> = {}
    out[`persona-${icsFileName(me.displayName)}`] = buildIcs(m.personal(me.displayName), personalEvents(ws.visibleProjects, me.id, !ws.isNetwork, m.milestone))
    for (const p of ws.visibleProjects) out[`progetto-${icsFileName(p.name)}`] = buildIcs(m.project(p.name), projectEvents(p, { milestoneLabel: m.milestone }))
    return out
  })

  const dir = ref('')
  const written = new Map<string, string>()
  const lastError = ref('')
  async function writeAll() {
    const s = ws.storage
    if (!s || !enabled.value) return
    try {
      const fs = await getFs()
      dir.value = await fs.join(s.root, CALENDARS_DIR)
      await fs.mkdir(dir.value)
      for (const [name, text] of Object.entries(files.value)) {
        if (written.get(name) === text) continue
        const path = await fs.join(dir.value, name)
        const current = (await fs.exists(path)) ? await fs.readText(path).catch(() => '') : ''
        if (current !== text) await fs.writeTextAtomic(path, text)
        written.set(name, text)
      }
      lastError.value = ''
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }
  watchDebounced(files, () => void writeAll(), { debounce: 3000 })
  watch(
    () => [enabled.value, ws.status] as const,
    ([on, st]) => {
      if (on && st === 'open') void writeAll()
      if (st !== 'open') written.clear()
    },
    { immediate: true },
  )

  return { blocked, enabled, setEnabled, files, dir, writeAll, lastError }
})
