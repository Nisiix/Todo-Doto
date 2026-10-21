import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import { withAi } from './ai'
import { getFs } from '@/services/fs'
import { nearest } from '@/services/aiAssist'
import { canExtract, extractText, type ExtractedPage } from '@/services/textExtract'
import { VectorIndex } from '@/services/vectorIndex'
import { ASK_MAX, ASK_THRESHOLD, answerFromPassages, mentionedSeqs, passageText, projectPassages, type Passage, type ProjectAnswer } from '@/services/askProject'
import type { AiConfig, Project } from '@/types'

export type AskPhase = { kind: 'files' } | { kind: 'index'; done: number; total: number } | { kind: 'search' } | { kind: 'answer' }
export type AskResult = ProjectAnswer | { nothing: true } | null

/** Allegati letti al massimo per domanda (i più recenti). */
const MAX_ATTACHMENTS = 40

/**
 * «Chiedi al progetto»: legge gli allegati di testo e PDF del progetto, tiene
 * l'indice degli embedding di questo PC (vedi vectorIndex.ts), cerca i
 * passaggi più vicini alla domanda e chiede la risposta al modello locale.
 */
export const useAskStore = defineStore('ask', () => {
  const ws = useWorkspaceStore()

  let index: VectorIndex | null = null
  let indexKey = ''
  async function indexFor(cfg: AiConfig) {
    const wsId = ws.meta?.id ?? ''
    const persist = !ws.meta?.encryption
    const key = `${wsId}|${cfg.provider}|${cfg.embedModel}|${persist}`
    if (!index || indexKey !== key) {
      index = await VectorIndex.open(wsId, `${cfg.provider}|${cfg.embedModel}`, persist)
      indexKey = key
    }
    return index
  }

  /** Testo degli allegati già letto, per percorso, dimensione e data di modifica. */
  const pages = new Map<string, ExtractedPage[]>()
  async function readAttachments(p: Project): Promise<Record<string, ExtractedPage[]>> {
    const fs = await getFs()
    const out: Record<string, ExtractedPage[]> = {}
    const files = p.attachments
      .filter((a) => a.kind === 'file' && canExtract(a.name || a.target))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .slice(0, MAX_ATTACHMENTS)
    for (const a of files) {
      try {
        const st = await fs.stat(a.target)
        if (!st) continue
        const key = `${a.target}|${st.size}|${st.mtimeMs}`
        let got = pages.get(key)
        if (!got) {
          got = await extractText(a.name || a.target, await fs.readBinary(a.target))
          pages.set(key, got)
        }
        out[a.id] = got
      } catch {
        /* file non raggiungibile o illeggibile: si va avanti senza */
      }
    }
    return out
  }

  async function ask(projectId: string, question: string, onPhase: (p: AskPhase) => void = () => {}): Promise<AskResult> {
    const p = ws.projects[projectId]
    if (!p || !question.trim()) return null
    return withAi(async (cfg) => {
      onPhase({ kind: 'files' })
      const attachments = await readAttachments(p)
      const all = projectPassages(p, { userName: ws.userName, attachments })
      const idx = await indexFor(cfg)
      onPhase({ kind: 'index', done: 0, total: 0 })
      const hits = await nearest(
        cfg,
        question,
        all.map((x) => ({ value: x, text: passageText(x) })),
        { mode: 'search', threshold: ASK_THRESHOLD, max: ASK_MAX, index: idx, onProgress: (done, total) => onPhase({ kind: 'index', done, total }) },
      )
      await idx.save().catch(() => undefined)
      onPhase({ kind: 'search' })
      // I task citati per codice («TODO-12») ci sono sempre, in testa
      const seqs = new Set(mentionedSeqs(question))
      const byCode = all.filter((x) => x.kind === 'task' && p.items.some((i) => i.id === x.itemId && seqs.has(i.seq)))
      const list: Passage[] = []
      for (const x of [...byCode, ...hits.map((h) => h.value)]) if (!list.some((y) => y.id === x.id)) list.push(x)
      if (!list.length) return { nothing: true as const }
      onPhase({ kind: 'answer' })
      return answerFromPassages(cfg, p.name, question, list.slice(0, ASK_MAX))
    })
  }

  function reset() {
    index = null
    indexKey = ''
    pages.clear()
  }

  return { ask, reset }
})
