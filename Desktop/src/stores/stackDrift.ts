import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { useWorkspaceStore } from './workspace'
import { getFs } from '@/services/fs'
import { checkFolder } from '@/services/fsErrors'
import { detectStack, type DetectedStack } from '@/services/projectScan'
import { getLocalProjectPath } from '@/services/projectFolder'
import { hasStack } from '@/services/scaffold'
import { stackDrift, type StackDrift } from '@/services/stackDrift'
import type { Project } from '@/types'

/** Una nuova lettura dei file dello stesso progetto, al massimo ogni tanto. */
const RECHECK_MS = 10 * 60_000

/**
 * «Stack non aggiornato»: aprendo un progetto con uno stack, si rileggono in
 * background i file della sua cartella (solo lettura, solo i file che già
 * legge «Rileva dai file del progetto») e si confronta. Le differenze si
 * mostrano in un avviso; l'amministratore le applica con un clic o le ignora
 * (su questo PC, finché non ne compaiono di nuove).
 */
export const useStackDriftStore = defineStore('stackDrift', () => {
  const ws = useWorkspaceStore()
  const detected = shallowRef<Record<string, DetectedStack>>({})
  const ignored = ref<Record<string, string>>({})
  const lastCheck = new Map<string, number>()
  const busy = new Set<string>()

  const storageKey = () => `pgm:stackDriftIgnored:${ws.meta?.id ?? ''}`
  watch(
    () => ws.meta?.id,
    () => {
      detected.value = {}
      lastCheck.clear()
      try {
        ignored.value = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as Record<string, string>
      } catch {
        ignored.value = {}
      }
    },
    { immediate: true },
  )

  /** Cartella del progetto su questo PC (quella trovata qui, altrimenti quella del progetto). */
  const folderOf = (p: Project) => (ws.meta ? getLocalProjectPath(ws.meta.id, p.id) : '') || p.stack.sourcePath.trim()

  async function check(p: Project, force = false) {
    if (!hasStack(p.stack) || p.trashedAt || busy.has(p.id)) return
    if (!force && Date.now() - (lastCheck.get(p.id) ?? 0) < RECHECK_MS) return
    const dir = folderOf(p)
    if (!dir) return
    busy.add(p.id)
    lastCheck.set(p.id, Date.now())
    try {
      const fs = await getFs()
      if (await checkFolder(fs, dir)) return // cartella non raggiungibile da qui: nessun avviso
      const det = await detectStack(dir)
      detected.value = { ...detected.value, [p.id]: det }
    } catch {
      /* lettura non riuscita: si riprova più avanti */
    } finally {
      busy.delete(p.id)
    }
  }

  /** Differenze fra lo stack salvato e i file (null se allineati, ignorate o non ancora lette). */
  function driftOf(p: Project): StackDrift | null {
    const det = detected.value[p.id]
    if (!det) return null
    const d = stackDrift(p.stack, det)
    return d && ignored.value[p.id] !== d.signature ? d : null
  }

  async function apply(p: Project) {
    const d = driftOf(p)
    if (!d || !ws.isAdmin) return false
    await ws.updateStack(p.id, d.next)
    return true
  }

  function ignore(p: Project) {
    const d = driftOf(p)
    if (!d) return
    ignored.value = { ...ignored.value, [p.id]: d.signature }
    try {
      localStorage.setItem(storageKey(), JSON.stringify(ignored.value))
    } catch {
      /* solo comodità locale */
    }
  }

  return { check, driftOf, apply, ignore }
})
