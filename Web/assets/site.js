// Tema chiaro/scuro (come nell'app: Ctrl+Shift+L o il pulsante), lingua del sito
// (italiano/inglese) e sezione download con l'installer nella lingua scelta.
(function () {
  const root = document.documentElement
  const store = {
    get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage non disponibile */ } },
  }

  // --- tema ------------------------------------------------------------------
  const THEME = 'pgm-site:theme'
  function applyTheme(t) {
    if (t) root.setAttribute('data-theme', t)
    else root.removeAttribute('data-theme')
  }
  applyTheme(store.get(THEME))
  const isDark = () => {
    const t = root.getAttribute('data-theme')
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  }
  function toggleTheme() {
    const next = isDark() ? 'light' : 'dark'
    applyTheme(next)
    store.set(THEME, next)
    document.querySelectorAll('.theme').forEach((b) => b.setAttribute('aria-pressed', String(next === 'dark')))
  }
  document.querySelectorAll('.theme').forEach((b) => b.addEventListener('click', toggleTheme))
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleTheme() }
  })

  // --- lingua ----------------------------------------------------------------
  // L'italiano è il testo delle pagine; gli altri testi sono in assets/i18n.js.
  // Le pagine legali sono file separati per lingua: lì il selettore è un link.
  const LANG = 'pgm-site:lang'
  const I18N = window.PGM_I18N || { runtime: {} }
  let lang = root.getAttribute('data-lang') === 'en' ? 'en' : 'it'

  /** Testi e attributi originali (italiano) degli elementi traducibili. */
  const originals = []
  document.querySelectorAll('*').forEach((el) => {
    const entry = { el, key: el.getAttribute('data-i18n'), html: el.innerHTML, attrs: [] }
    for (const a of el.attributes) {
      if (a.name.startsWith('data-i18n-')) {
        const attr = a.name.slice('data-i18n-'.length)
        entry.attrs.push({ attr, key: a.value, value: el.getAttribute(attr) })
      }
    }
    if (entry.key || entry.attrs.length) originals.push(entry)
  })

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'it'
    const d = lang === 'it' ? {} : I18N[lang] || {}
    for (const o of originals) {
      if (o.key) o.el.innerHTML = d[o.key] ?? o.html
      for (const a of o.attrs) {
        const v = d[a.key] ?? a.value
        if (v == null) o.el.removeAttribute(a.attr)
        else o.el.setAttribute(a.attr, v)
      }
    }
    document.querySelectorAll('img[data-shot]').forEach((img) => {
      img.src = img.getAttribute('src').replace(/\/screens\/(it|en)\//, `/screens/${lang}/`)
    })
    root.lang = lang
    root.setAttribute('data-lang', lang)
    root.classList.remove('i18n-pending')
    document.querySelectorAll('.lang [data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang)))
    updateDownload()
  }

  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-set-lang]') : null
    if (!el) return
    const next = el.getAttribute('data-set-lang')
    store.set(LANG, next)
    if (el.tagName === 'A') return // pagina legale: il link porta alla versione nell'altra lingua
    const url = new URL(location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', next)
      history.replaceState(null, '', url)
    }
    applyLang(next)
  })

  // --- download ----------------------------------------------------------------
  // Fonti, in ordine: downloads/manifest.json (server web, vedi downloads/README.md),
  // l'ultima Release su GitHub con gli asset della lingua, la pagina delle Release.
  const box = document.querySelector('[data-download]')
  const repo = box && box.dataset.repo
  const releasesUrl = `https://github.com/${repo}/releases`
  const manifest = box ? fetch('downloads/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null
  let release = null
  const mb = (bytes) => `${Math.max(1, Math.round(bytes / 1048576))} MB`

  async function filesFor(l) {
    const m = await manifest
    if (m && m.files) {
      // Formato per lingua: files.it / files.en. Il vecchio formato (files.msi) vale per l'italiano.
      const f = m.files[l] || (l === 'it' && (m.files.msi || m.files.exe) ? m.files : null)
      if (f) {
        const pick = (x) => x && { url: 'downloads/' + x.name, size: x.size || '' }
        return { source: 'server', version: m.version, date: m.date, msi: pick(f.msi), exe: pick(f.exe) }
      }
    }
    release = release || fetch(`https://api.github.com/repos/${repo}/releases/latest`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const rel = await release
    if (rel && Array.isArray(rel.assets)) {
      const find = (re) => {
        const a = rel.assets.find((x) => re.test(x.name))
        return a && { url: a.browser_download_url, size: mb(a.size) }
      }
      const msi = find(new RegExp(`_${l}\\.msi$`, 'i'))
      const exe = find(new RegExp(`_${l}-setup\\.exe$`, 'i'))
      if (msi || exe) return { source: 'github', version: String(rel.tag_name || '').replace(/^v/, ''), date: String(rel.published_at || '').slice(0, 10), msi, exe }
    }
    return null
  }

  async function updateDownload() {
    if (!box) return
    const l = lang
    const t = I18N.runtime[l]
    const f = await filesFor(l)
    if (l !== lang) return // nel frattempo la lingua è cambiata
    const note = box.querySelector('.dl-note')
    box.querySelectorAll('[data-kind]').forEach((a) => {
      const file = f && f[a.dataset.kind]
      a.href = file ? file.url : releasesUrl
      a.title = file && file.size ? file.size : ''
    })
    const ver = box.querySelector('.ver')
    if (ver && f && f.version) ver.textContent = t.version(f.version, f.date)
    if (note) {
      note.hidden = f && f.source === 'server'
      note.textContent = f ? t.noServer : t.noFiles
    }
  }

  applyLang(lang)
})()
