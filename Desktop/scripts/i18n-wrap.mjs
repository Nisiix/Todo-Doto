// Strumento una tantum per l'internazionalizzazione: avvolge le stringhe
// italiane dei componenti .vue in t('…') e stampa ciò che va rivisto a mano.
//
//   node scripts/i18n-wrap.mjs            (anteprima: solo report)
//   node scripts/i18n-wrap.mjs --write    (riscrive i file)
//   node scripts/i18n-wrap.mjs --keys     (elenca tutte le chiavi t('…') presenti)
//
// Regole: testo fra tag senza {{ }} → {{ t('testo') }}; attributi statici
// title/placeholder/aria-label/description/label/hint/confirm-label → :attr="t('…')";
// nello script: label: '…', title: '…', message: '…', confirmLabel: '…', ui.toast('…'.
// I testi con {{ }} misti o template literal con ${} vengono elencati per la revisione.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WRITE = process.argv.includes('--write')
const KEYS = process.argv.includes('--keys')
const SRC = fileURLToPath(new URL('../src/', import.meta.url))

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue') || (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts') && !p.includes('i18n'))) out.push(p)
  }
  return out
}

const hasLetters = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s)
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const ATTRS = ['title', 'placeholder', 'aria-label', 'description', 'label', 'hint', 'confirm-label', 'alt']

const report = { files: 0, textNodes: 0, attrs: 0, script: 0, manual: [] }
const allKeys = new Set()

for (const file of walk(SRC)) {
  let s = readFileSync(file, 'utf8')
  const rel = file.slice(SRC.length)
  const orig = s
  if (KEYS) {
    for (const m of s.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) allKeys.add(m[1].replace(/\\'/g, "'"))
    for (const m of s.matchAll(/\btn\(\s*[^,]+,\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g)) {
      allKeys.add(m[1].replace(/\\'/g, "'"))
      allKeys.add(m[2].replace(/\\'/g, "'"))
    }
    continue
  }
  if (!file.endsWith('.vue')) continue
  const tplStart = s.indexOf('<template>')
  if (tplStart < 0) continue
  let head = s.slice(0, tplStart)
  let tpl = s.slice(tplStart)

  // --- template: testo fra tag ---------------------------------------------
  tpl = tpl.replace(/>([^<>{}]+)</g, (m, text) => {
    const trimmed = text.trim()
    if (!hasLetters(trimmed)) return m
    if (/^t\(/.test(trimmed)) return m
    report.textNodes++
    const lead = text.slice(0, text.indexOf(trimmed))
    const trail = text.slice(text.indexOf(trimmed) + trimmed.length)
    return `>${lead}{{ t('${esc(trimmed.replace(/\s+/g, ' '))}') }}${trail}<`
  })
  // testi misti con {{ }} → da rivedere a mano
  for (const m of tpl.matchAll(/>([^<>]*\{\{[^<>]*)</g)) {
    const text = m[1].replace(/\{\{[^}]*\}\}/g, '').trim()
    if (hasLetters(text) && !/t\('/.test(m[1])) report.manual.push(`${rel}: ${m[1].trim().slice(0, 90)}`)
  }
  // --- template: attributi statici --------------------------------------------
  for (const a of ATTRS) {
    tpl = tpl.replace(new RegExp(`(\\s)${a}="([^"{}]+)"`, 'g'), (m, sp, val) => {
      if (!hasLetters(val)) return m
      report.attrs++
      return `${sp}:${a}="t('${esc(val)}')"`
    })
  }
  // --- script: chiavi note ---------------------------------------------------------
  head = head.replace(/\b(label|title|message|confirmLabel|placeholder|text|hint|description):\s*'((?:[^'\\]|\\.)+)'/g, (m, k, v) => {
    if (!hasLetters(v)) return m
    report.script++
    return `${k}: t('${v}')`
  })
  head = head.replace(/ui\.toast\(\s*'((?:[^'\\]|\\.)+)'/g, (m, v) => {
    report.script++
    return `ui.toast(t('${v}')`
  })
  for (const m of head.matchAll(/\b(label|title|message|confirmLabel|text):\s*`([^`]*\$\{[^`]*)`/g)) report.manual.push(`${rel}: ${m[1]}: \`${m[2].slice(0, 80)}\``)
  for (const m of head.matchAll(/ui\.toast\(\s*`([^`]*)`/g)) report.manual.push(`${rel}: toast \`${m[1].slice(0, 80)}\``)

  s = head + tpl
  if (s !== orig) {
    report.files++
    if (!/from '@\/i18n'/.test(s) && /\bt\(/.test(s)) s = s.replace(/<script setup lang="ts">\n/, "<script setup lang=\"ts\">\nimport { t } from '@/i18n'\n")
    if (WRITE) writeFileSync(file, s)
  }
}

if (KEYS) {
  for (const k of [...allKeys].sort()) console.log(k)
  console.error(`${allKeys.size} chiavi`)
} else {
  console.log(JSON.stringify({ files: report.files, textNodes: report.textNodes, attrs: report.attrs, script: report.script, manual: report.manual.length }, null, 2))
  console.log('\nDa rivedere a mano:')
  for (const m of report.manual) console.log('  ' + m)
}
