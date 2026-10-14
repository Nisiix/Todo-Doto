/**
 * Anteprima di documenti dentro l'app: decide come mostrare un file dal suo
 * nome/tipo e produce il contenuto (URL blob o testo). Nessuna dipendenza da Vue.
 */
export type PreviewKind = 'image' | 'pdf' | 'text' | 'web' | 'none'

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])
const TEXT = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'toml',
  'ts', 'js', 'vue', 'css', 'html', 'htm', 'cs', 'sql', 'py', 'rs', 'sh', 'bat', 'cmd', 'ps1',
])

export const extensionOf = (name: string) => (name.split(/[\\/]/).pop() ?? '').split('.').pop()?.toLowerCase() ?? ''

/** Tipo di anteprima da nome file o MIME. */
export function previewKind(name: string, mime?: string | null): PreviewKind {
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('text/') || m === 'application/json') return 'text'
  const ext = extensionOf(name)
  if (IMAGE.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (TEXT.has(ext)) return 'text'
  return 'none'
}

export const mimeFor = (kind: PreviewKind, name: string) => {
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'image') {
    const ext = extensionOf(name)
    return ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
  }
  return 'text/plain'
}

export interface PreviewContent {
  kind: PreviewKind
  url?: string // blob URL per image/pdf, o indirizzo per web
  text?: string
  revoke?: () => void
}

/** Costruisce l'anteprima da byte già letti. */
export function previewFromBytes(name: string, bytes: Uint8Array, mime?: string | null): PreviewContent {
  const kind = previewKind(name, mime)
  if (kind === 'text') return { kind, text: new TextDecoder().decode(bytes).slice(0, 200_000) }
  if (kind === 'image' || kind === 'pdf') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime ?? mimeFor(kind, name) }))
    return { kind, url, revoke: () => URL.revokeObjectURL(url) }
  }
  return { kind: 'none' }
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`
