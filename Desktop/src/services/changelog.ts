/** Lettura di CHANGELOG.md: `## titolo` seguito da righe `- …`. Usata dal dialog «Novità». */
export interface Release {
  title: string
  items: string[]
}

export function parseChangelog(md: string): Release[] {
  const out: Release[] = []
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) out.push({ title: line.slice(3).trim(), items: [] })
    else if (line.startsWith('- ') && out.length) out[out.length - 1]!.items.push(line.slice(2).trim())
  }
  return out
}
