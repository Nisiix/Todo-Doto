// Confronta le chiavi usate nel codice (t('…'), tn(…)) con en.ts: stampa
// le chiavi senza traduzione e quelle tradotte ma non più usate.
//   node scripts/i18n-check.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const used = execFileSync(process.execPath, [here + 'i18n-wrap.mjs', '--keys'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n')
  .filter(Boolean)
const enSrc = readFileSync(here + '../src/i18n/en.ts', 'utf8')
const translated = new Set()
for (const m of enSrc.matchAll(/^\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*)):/gm)) translated.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'"))
const missing = used.filter((k) => !translated.has(k))
const unused = [...translated].filter((k) => !used.includes(k))
console.log(`${used.length} chiavi usate · ${translated.size} tradotte · ${missing.length} senza traduzione · ${unused.length} non più usate`)
if (missing.length) {
  console.log('\nSenza traduzione:')
  for (const k of missing) console.log('  ' + k)
}
if (process.argv.includes('--unused') && unused.length) {
  console.log('\nNon più usate (etichette dei dati e chiavi dei servizi sono normali qui):')
  for (const k of unused) console.log('  ' + k)
}
