/**
 * Testo dei documenti allegati, per «Chiedi al progetto»: file di testo
 * (.md, .txt…) e PDF con testo (non le scansioni: servirebbe l'OCR). Il
 * lettore dei PDF (pdf.js) si carica solo alla prima richiesta.
 */
import { extensionOf } from './preview'

/** Tipi di allegato da cui si ricava il testo. */
export const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'text', 'log', 'csv', 'pdf'])
export const canExtract = (name: string) => TEXT_EXTENSIONS.has(extensionOf(name))

/** Oltre questa dimensione un allegato non si legge (tempo e memoria). */
export const MAX_BYTES = 15 * 1024 * 1024
/** Testo massimo tenuto per documento. */
export const MAX_CHARS = 300_000

export interface ExtractedPage {
  /** Numero di pagina (PDF), 0 per i file di testo. */
  page: number
  text: string
}

let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfJs() {
  pdfjs ??= (async () => {
    const lib = await import('pdfjs-dist')
    // Worker impacchettato da Vite come file .js (servito ovunque con il tipo giusto)
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
    return lib
  })()
  return pdfjs
}

async function pdfPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const lib = await loadPdfJs()
  const doc = await lib.getDocument({ data: bytes.slice(), disableFontFace: true }).promise
  const out: ExtractedPage[] = []
  let total = 0
  try {
    for (let n = 1; n <= doc.numPages && total < MAX_CHARS; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let text = ''
      for (const it of content.items) {
        if (!('str' in it)) continue
        text += it.str + (it.hasEOL ? '\n' : ' ')
      }
      text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()
      if (text) out.push({ page: n, text })
      total += text.length
    }
  } finally {
    await doc.destroy()
  }
  return out
}

/** Testo del documento, per pagine (una sola per i file di testo); [] se non se ne ricava. */
export async function extractText(name: string, bytes: Uint8Array): Promise<ExtractedPage[]> {
  if (bytes.length > MAX_BYTES) return []
  if (extensionOf(name) === 'pdf') return pdfPages(bytes)
  const text = new TextDecoder().decode(bytes).slice(0, MAX_CHARS).trim()
  return text ? [{ page: 0, text }] : []
}
