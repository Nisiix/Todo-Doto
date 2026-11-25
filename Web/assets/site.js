// Tema chiaro/scuro (come nell'app: Ctrl+Shift+L o il pulsante), lingua del sito
// (inglese, italiano, francese, tedesco, spagnolo) e sezione download con
// l'installer nella lingua scelta.
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
  const LANGS = ['en', 'it', 'fr', 'de', 'es']
  const norm = (l) => (LANGS.includes(l) ? l : 'en')
  /** Schermate e video esistono in italiano e in inglese: le altre lingue usano quelli inglesi. */
  const mediaLang = (l) => (l === 'it' ? 'it' : 'en')
  const runtime = () => I18N.runtime[lang] || I18N.runtime.en
  let lang = norm(root.getAttribute('data-lang'))

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

  /** Chiamata dopo ogni cambio di lingua (lo stepper riscrive la sezione corrente). */
  let onLangChange = null

  function applyLang(next) {
    lang = norm(next)
    // Testi mancanti in una lingua: si usa l'inglese
    const d = lang === 'it' ? {} : Object.assign({}, I18N.en, I18N[lang])
    for (const o of originals) {
      if (o.key) o.el.innerHTML = d[o.key] ?? o.html
      for (const a of o.attrs) {
        const v = d[a.key] ?? a.value
        if (v == null) o.el.removeAttribute(a.attr)
        else o.el.setAttribute(a.attr, v)
      }
    }
    document.querySelectorAll('img[data-shot]').forEach((img) => {
      img.src = img.getAttribute('src').replace(/\/screens\/(it|en)\//, `/screens/${mediaLang(lang)}/`)
    })
    // Video tutorial e anteprime nella lingua scelta
    document.querySelectorAll('img[data-poster]').forEach((img) => {
      img.src = img.getAttribute('src').replace(/\/video\/(it|en)\//, `/video/${mediaLang(lang)}/`)
    })
    showTutorial(currentTutorial, false)
    root.lang = lang
    root.setAttribute('data-lang', lang)
    root.classList.remove('i18n-pending')
    document.querySelectorAll('.lang [data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang)))
    document.querySelectorAll('select[data-lang-select]').forEach((s) => { s.value = lang })
    updateDownload()
    zoomLabels()
    renderChangelog()
    if (onLangChange) onLangChange()
  }

  /** Pagina «Novità» nella lingua scelta (se il file manca, quello italiano). */
  let changelogLang = ''
  function renderChangelog() {
    const log = document.querySelector('[data-changelog]')
    if (!log || changelogLang === lang) return
    const want = (changelogLang = lang)
    const t = runtime()
    const get = (f) => fetch(f, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error('no changelog'))))
    ;(want === 'it' ? get('changelog.md') : get(`changelog.${want}.md`).catch(() => get('changelog.md')))
      .then((md) => {
        if (want !== lang) return
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
      .catch(() => { if (want === lang) log.innerHTML = `<p>${t.noChangelog}</p>` })
  }

  function chooseLang(next) {
    store.set(LANG, next)
    const url = new URL(location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', next)
      history.replaceState(null, '', url)
    }
    applyLang(next)
  }
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-set-lang]') : null
    if (!el) return
    const next = el.getAttribute('data-set-lang')
    if (el.tagName === 'A') return void store.set(LANG, next) // pagina legale: il link porta alla versione nell'altra lingua
    chooseLang(next)
  })
  document.querySelectorAll('select[data-lang-select]').forEach((s) => s.addEventListener('change', () => chooseLang(s.value)))

  // --- download ----------------------------------------------------------------
  // Fonti, in ordine: downloads/manifest.json (server web, vedi downloads/README.md),
  // l'ultima Release su GitHub con gli asset della lingua, la pagina delle Release.
  const box = document.querySelector('[data-download]')
  const repo = box && box.dataset.repo
  const releasesUrl = `https://github.com/${repo}/releases/latest`
  const manifest = box ? fetch('downloads/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null
  let release = null
  const mb = (bytes) => `${Math.max(1, Math.round(bytes / 1048576))} MB`

  async function filesFor(l) {
    const m = await manifest
    if (m && m.files) {
      // Formato per lingua: files.it / files.en. Il vecchio formato (files.msi) vale per l'italiano.
      const f = m.files[l] || (l === 'it' && (m.files.msi || m.files.exe) ? m.files : null)
      if (f) {
        const pick = (x) => x && { url: 'downloads/' + x.name, name: x.name, size: x.size || '', sha256: x.sha256 || '' }
        return { source: 'server', version: m.version, date: m.date, msi: pick(f.msi), exe: pick(f.exe), portable: pick(f.portable) }
      }
    }
    release = release || fetch(`https://api.github.com/repos/${repo}/releases/latest`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const rel = await release
    if (rel && Array.isArray(rel.assets)) {
      const find = (re) => {
        const a = rel.assets.find((x) => re.test(x.name))
        // GitHub calcola da sé l'impronta di ogni asset ("digest": "sha256:…")
        const sha = /^sha256:([0-9a-f]{64})$/i.exec(String(a && a.digest || ''))
        return a && { url: a.browser_download_url, name: a.name, size: mb(a.size), sha256: sha ? sha[1] : '' }
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
    const t = runtime()
    // Una Release senza i file di questa lingua (versioni precedenti): l'app in inglese
    const f = (await filesFor(l)) || (l === 'it' || l === 'en' ? null : await filesFor('en'))
    if (l !== lang) return // nel frattempo la lingua è cambiata
    const note = box.querySelector('.dl-note')
    box.querySelectorAll('[data-kind]').forEach((a) => {
      const file = f && f[a.dataset.kind]
      a.href = file ? file.url : releasesUrl
      // Lingua reale del file (per fr/de/es una Release vecchia può offrire quello inglese)
      const fl = file && /_(en|it|fr|de|es)(?:-setup|-portable)?\.(?:exe|msi)$/i.exec(file.name)
      a.dataset.lang = file ? (fl ? fl[1].toLowerCase() : l) : ''
      a.dataset.size = file && file.size ? file.size : ''
      const size = a.querySelector('.dl-size')
      if (size) size.textContent = file && file.size ? t.size(file.size) : ''
    })
    box.dataset.version = f && f.version ? f.version : ''
    const ver = box.querySelector('.ver')
    if (ver && f && f.version) ver.textContent = t.version(f.version, f.date)
    if (note) {
      note.hidden = !!f
      note.textContent = t.noFiles
    }
    const sums = box.querySelector('.dl-sums')
    if (sums) {
      const rows = f ? ['exe', 'msi', 'portable'].map((k) => f[k]).filter((x) => x && x.sha256) : []
      sums.hidden = !rows.length
      const list = sums.querySelector('ul')
      list.replaceChildren(...rows.map((x) => {
        const li = document.createElement('li')
        const name = document.createElement('span')
        name.textContent = x.name
        const hash = document.createElement('code')
        hash.textContent = x.sha256
        li.append(name, hash)
        return li
      }))
    }
  }

  // --- contatore dei download per dispositivo -----------------------------------
  // Al clic su un file, un identificativo casuale del browser (creato una volta e
  // salvato in localStorage) parte in background verso la funzione indicata in
  // data-counter (supabase/functions/download-count). Il server ne salva solo un
  // hash, senza IP. Il download segue il link e non aspetta: se l'invio fallisce,
  // non succede nulla. Vedi l'informativa privacy, § 3.
  const counter = box && box.dataset.counter
  const DEVICE = 'todo-doto:device'
  function deviceId() {
    let id = store.get(DEVICE)
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      if (!window.crypto || typeof crypto.randomUUID !== 'function') return ''
      id = crypto.randomUUID()
      store.set(DEVICE, id)
      if (store.get(DEVICE) !== id) return '' // storage non disponibile: non contare
    }
    return id
  }
  function countDownload(a) {
    try {
      const version = box.dataset.version
      if (!counter || !version || !a.dataset.lang) return
      const d = deviceId()
      if (!d || !navigator.sendBeacon) return
      // Stringa → text/plain: nessuna richiesta preliminare CORS, parte anche se la pagina cambia.
      navigator.sendBeacon(counter, JSON.stringify({ d, l: a.dataset.lang, k: a.dataset.kind, v: version }))
    } catch { /* il contatore non deve mai bloccare il download */ }
  }
  if (box && counter) {
    box.querySelectorAll('a[data-kind]').forEach((a) => {
      a.addEventListener('click', () => countDownload(a))
      a.addEventListener('auxclick', (e) => { if (e.button === 1) countDownload(a) })
    })
  }

  // --- Novità: changelog.md (italiano) e changelog.<lingua>.md, copiati dal workflow del
  // sito da Desktop/CHANGELOG*.md → HTML. Si ridisegna a ogni cambio di lingua.
  renderChangelog()

  // --- video tutorial: un lettore, l'elenco sceglie quale video --------------------
  const player = document.querySelector('video[data-video]')
  let currentTutorial = player ? player.dataset.video : ''
  function showTutorial(id, play) {
    if (!player || !id) return
    const src = `assets/video/${mediaLang(lang)}/${id}.mp4`
    const source = player.querySelector('source')
    if (source.getAttribute('src') !== src) {
      source.setAttribute('src', src)
      player.setAttribute('poster', `assets/video/${mediaLang(lang)}/${id}.jpg`)
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
    const t = runtime()
    document.querySelectorAll('img[data-shot]').forEach((img) => img.setAttribute('aria-label', `${t.zoom}: ${img.alt}`))
  }
  function openShot(img) {
    if (lb) return
    const t = runtime()
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

  // --- stepper delle sezioni (landing) ---------------------------------------
  // Il passo attivo è l'ultimo la cui sezione è salita oltre un terzo della finestra;
  // la linea avanza anche dentro la sezione, fino all'inizio della successiva.
  // In fondo alla pagina è attivo l'ultimo (la sezione Dona è corta e non arriva lassù).
  const stepper = document.querySelector('[data-stepper]')
  if (stepper) {
    const toggle = stepper.querySelector('.stepper__toggle')
    const now = stepper.querySelector('.stepper__now')
    const count = stepper.querySelector('.stepper__count')
    const list = stepper.querySelector('.stepper__list')
    const steps = [...stepper.querySelectorAll('a[data-step]')].map((a) => ({
      a,
      sections: a.getAttribute('data-step').split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean),
    })).filter((s) => s.sections.length)
    const links = steps.map((s) => s.a)
    let current = -2
    const label = (i) => (i >= 0 ? steps[i].a.querySelector('.stepper__label').textContent : toggle.getAttribute('title'))
    const update = (force) => {
      const line = innerHeight / 3
      const tops = steps.map((s) => s.sections[0].getBoundingClientRect().top)
      let active = -1
      tops.forEach((t, i) => { if (t <= line) active = i })
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2
      if (atEnd) active = steps.length - 1
      // Avanzamento dentro la sezione attiva (0 = inizio, 1 = inizio della successiva)
      let part = 0
      if (active >= 0 && active < steps.length - 1) {
        part = Math.min(1, Math.max(0, (line - tops[active]) / Math.max(1, tops[active + 1] - tops[active])))
      }
      const progress = steps.length > 1 ? Math.max(0, active + part) / (steps.length - 1) : 0
      list.style.setProperty('--progress', progress.toFixed(4))
      if (active === current && !force) return
      current = active
      steps.forEach((s, i) => {
        s.a.classList.toggle('is-active', i === active)
        s.a.classList.toggle('is-done', i < active)
        if (i === active) s.a.setAttribute('aria-current', 'location')
        else s.a.removeAttribute('aria-current')
      })
      // Pulsante degli schermi stretti: la sezione corrente e la posizione
      now.textContent = label(active)
      count.textContent = active >= 0 ? `${active + 1}/${steps.length}` : ''
    }
    let queued = false
    const schedule = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => { queued = false; update() })
    }
    addEventListener('scroll', schedule, { passive: true })
    addEventListener('resize', schedule)
    onLangChange = () => update(true)
    update(true)

    // Dopo il salto il fuoco va sul titolo della sezione (tastiera e lettori di schermo
    // proseguono da lì), senza scorrere di nuovo la pagina
    stepper.addEventListener('click', (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[data-step]') : null
      if (!a) return
      const target = document.querySelector(a.getAttribute('href'))
      const heading = target && target.querySelector('h2')
      if (!heading) return
      heading.tabIndex = -1
      // dopo la navigazione all'ancora, che altrimenti riporta il fuoco sul documento
      setTimeout(() => heading.focus({ preventScroll: true }), 0)
    })
    // Frecce su e giù tra le voci, Home e Fine per la prima e l'ultima
    list.addEventListener('keydown', (e) => {
      const at = links.indexOf(document.activeElement)
      if (at < 0) return
      const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: links.length - 1 }[e.key]
      if (to === undefined) return
      e.preventDefault()
      links[(to + links.length) % links.length].focus()
    })

    // Schermi stretti: il pulsante apre e chiude l'elenco
    const setOpen = (open) => {
      stepper.classList.toggle('is-open', open)
      toggle.setAttribute('aria-expanded', String(open))
    }
    toggle.addEventListener('click', () => {
      const open = !stepper.classList.contains('is-open')
      setOpen(open)
      if (open) (links[Math.max(current, 0)] || links[0]).focus()
    })
    stepper.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('a')) setOpen(false) })
    document.addEventListener('click', (e) => { if (e.target instanceof Node && !stepper.contains(e.target)) setOpen(false) })
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && stepper.classList.contains('is-open')) { setOpen(false); toggle.focus() }
    })
  }

  applyLang(lang)
})()

