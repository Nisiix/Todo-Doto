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
    // Video tutorial e anteprime nella lingua scelta
    document.querySelectorAll('img[data-poster]').forEach((img) => {
      img.src = img.getAttribute('src').replace(/\/video\/(it|en)\//, `/video/${lang}/`)
    })
    showTutorial(currentTutorial, false)
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
        return { source: 'server', version: m.version, date: m.date, msi: pick(f.msi), exe: pick(f.exe), portable: pick(f.portable) }
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
      const portable = find(new RegExp(`_${l}-portable\\.exe$`, 'i'))
      if (msi || exe || portable) return { source: 'github', version: String(rel.tag_name || '').replace(/^v/, ''), date: String(rel.published_at || '').slice(0, 10), msi, exe, portable }
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
      a.dataset.size = file && file.size ? file.size : ''
    })
    const ver = box.querySelector('.ver')
    if (ver && f && f.version) ver.textContent = t.version(f.version, f.date)
    if (note) {
      note.hidden = f && f.source === 'server'
      note.textContent = f ? t.noServer : t.noFiles
    }
  }

  // --- Novità: changelog.md (copiato dal workflow del sito da Desktop/CHANGELOG.md) → HTML ---
  const log = document.querySelector('[data-changelog]')
  if (log) {
    const t = I18N.runtime[lang]
    fetch('changelog.md', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('no changelog'))))
      .then((md) => {
        const esc = (x) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
        const inline = (x) => esc(x).replace(/`([^`]+)`/g, '<code>$1</code>')
        let html = ''
        let open = false
        for (const line of md.split('\n')) {
          if (line.startsWith('# ')) continue
          if (line.startsWith('## ')) { if (open) html += '</ul>'; html += `<h2>${inline(line.slice(3))}</h2><ul>`; open = true }
          else if (line.startsWith('- ') && open) html += `<li>${inline(line.slice(2))}</li>`
        }
        if (open) html += '</ul>'
        log.innerHTML = html || `<p>${t.noChangelog}</p>`
      })
      .catch(() => { log.innerHTML = `<p>${t.noChangelog}</p>` })
  }

  // --- video tutorial: un lettore, l'elenco sceglie quale video --------------------
  const player = document.querySelector('video[data-video]')
  let currentTutorial = player ? player.dataset.video : ''
  function showTutorial(id, play) {
    if (!player || !id) return
    const src = `assets/video/${lang}/${id}.mp4`
    const source = player.querySelector('source')
    if (source.getAttribute('src') !== src) {
      source.setAttribute('src', src)
      player.setAttribute('poster', `assets/video/${lang}/${id}.jpg`)
      player.load()
    }
    currentTutorial = id
    player.dataset.video = id
    document.querySelectorAll('[data-tutorial]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tutorial === id)))
    if (play) player.play().catch(() => {})
  }
  document.querySelectorAll('[data-tutorial]').forEach((b) =>
    b.addEventListener('click', () => {
      showTutorial(b.dataset.tutorial, true)
      if (player.getBoundingClientRect().top < 0) player.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }),
  )

  // --- immagini delle funzionalità: clic per ingrandire, Esc / X / clic fuori per chiudere ---
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let lb = null
  function zoomLabels() {
    const t = I18N.runtime[lang] || I18N.runtime.it
    document.querySelectorAll('img[data-shot]').forEach((img) => img.setAttribute('aria-label', `${t.zoom}: ${img.alt}`))
  }
  function openShot(img) {
    if (lb) return
    const t = I18N.runtime[lang] || I18N.runtime.it
    const from = img.getBoundingClientRect()
    lb = document.createElement('div')
    lb.className = 'lightbox'
    lb.setAttribute('role', 'dialog')
    lb.setAttribute('aria-modal', 'true')
    lb.setAttribute('aria-label', img.alt)
    lb.innerHTML = `<button type="button" class="lightbox__close" aria-label="${t.close}" title="${t.close}">×</button><img class="lightbox__img" alt="" /><p class="lightbox__cap"></p>`
    const big = lb.querySelector('.lightbox__img')
    big.src = img.currentSrc || img.src
    big.alt = img.alt
    lb.querySelector('.lightbox__cap').textContent = img.alt
    document.body.appendChild(lb)
    document.documentElement.classList.add('lightbox-open')
    // Dimensione finale: tutta la finestra, mantenendo le proporzioni
    const ratio = (img.naturalWidth || from.width) / (img.naturalHeight || from.height)
    const maxW = Math.min(innerWidth * 0.94, 1600)
    const maxH = innerHeight * 0.86
    const w = Math.min(maxW, maxH * ratio)
    const h = w / ratio
    const to = { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2 - 12, width: w, height: h }
    Object.assign(big.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${w}px`, height: `${h}px` })
    const fromT = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / w})`
    lb.ctx = { img, fromT }
    if (!reduced) {
      big.style.transform = fromT
      big.getBoundingClientRect() // applica la posizione di partenza prima della transizione
    }
    requestAnimationFrame(() => {
      lb.classList.add('is-open')
      big.style.transform = ''
    })
    lb.addEventListener('click', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.lightbox__cap')) closeShot()
    })
    lb.querySelector('.lightbox__close').focus()
  }
  function closeShot() {
    if (!lb || lb.closing) return
    const el = lb
    el.closing = true
    const big = el.querySelector('.lightbox__img')
    const { img } = el.ctx
    // Torna alla posizione attuale della miniatura (la pagina può essere scorsa nel frattempo)
    const from = img.getBoundingClientRect()
    const to = big.getBoundingClientRect()
    el.classList.remove('is-open')
    if (!reduced) big.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`
    const done = () => {
      el.remove()
      document.documentElement.classList.remove('lightbox-open')
      img.focus({ preventScroll: true })
    }
    if (reduced) done()
    else setTimeout(done, 280)
    lb = null
  }
  document.querySelectorAll('img[data-shot]').forEach((img) => {
    img.tabIndex = 0
    img.setAttribute('role', 'button')
    img.addEventListener('click', () => openShot(img))
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openShot(img)
      }
    })
  })
  window.addEventListener('keydown', (e) => {
    if (!lb) return
    if (e.key === 'Escape') closeShot()
    // Il fuoco resta nella finestra ingrandita (c'è un solo controllo: Chiudi)
    if (e.key === 'Tab') {
      e.preventDefault()
      lb.querySelector('.lightbox__close').focus()
    }
  })

  applyLang(lang)
  zoomLabels()
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-set-lang]')) zoomLabels()
  })
})()

