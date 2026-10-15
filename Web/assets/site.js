// Tema chiaro/scuro (come nell'app: Ctrl+Shift+L o il pulsante), sezione download,
// prezzi (annuale/perpetua), changelog.
(function () {
  const root = document.documentElement
  const KEY = 'pgm-site:theme'
  function apply(t) {
    if (t) root.setAttribute('data-theme', t)
    else root.removeAttribute('data-theme')
  }
  try { apply(localStorage.getItem(KEY)) } catch {}
  function isDark() {
    const t = root.getAttribute('data-theme')
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  }
  function toggle() {
    const next = isDark() ? 'light' : 'dark'
    apply(next)
    try { localStorage.setItem(KEY, next) } catch {}
    document.querySelectorAll('.theme').forEach((b) => b.setAttribute('aria-pressed', String(next === 'dark')))
  }
  document.querySelectorAll('.theme').forEach((b) => b.addEventListener('click', toggle))
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggle() }
  })

  // --- Download: legge downloads/manifest.json se presente (generato dal workflow). --
  // Finché non c'è, i pulsanti rimandano alle Release su GitHub.
  const box = document.querySelector('[data-download]')
  if (box) {
    const releases = box.dataset.releases
    const note = box.querySelector('.dl-note')
    const sums = box.querySelector('.dl-sums')
    fetch('downloads/manifest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
      .then((m) => {
        const lines = []
        box.querySelectorAll('[data-kind]').forEach((a) => {
          const f = m.files && m.files[a.dataset.kind]
          if (f) {
            a.href = f.url || 'downloads/' + f.name
            a.removeAttribute('aria-disabled')
            if (f.size) a.title = `${f.name} · ${f.size}`
            if (f.sha256) lines.push(`SHA-256 ${a.dataset.kind.toUpperCase()}: ${f.sha256}`)
          }
        })
        const ver = box.querySelector('.ver')
        if (ver && m.version) ver.textContent = `Versione ${m.version} · Windows 10/11 (64 bit)` + (m.date ? ` · ${m.date}` : '')
        if (note) note.hidden = true
        if (sums && lines.length) { sums.textContent = lines.join('\n'); sums.hidden = false }
      })
      .catch(() => {
        box.querySelectorAll('[data-kind]').forEach((a) => { a.href = releases })
        if (note) note.hidden = false
      })
  }

  // --- Changelog: changelog.md (copiato dal workflow) → HTML -----------------
  const log = document.querySelector('[data-changelog]')
  if (log) {
    fetch('changelog.md', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('no changelog'))))
      .then((md) => {
        const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
        const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>')
        let html = ''
        let open = false
        for (const line of md.split('\n')) {
          if (line.startsWith('# ')) continue
          if (line.startsWith('## ')) { if (open) html += '</ul>'; html += `<h2>${inline(line.slice(3))}</h2><ul>`; open = true }
          else if (line.startsWith('- ') && open) html += `<li>${inline(line.slice(2))}</li>`
        }
        if (open) html += '</ul>'
        log.innerHTML = html || '<p>Nessuna versione pubblicata ancora.</p>'
      })
      .catch(() => { log.innerHTML = '<p>Le note di versione sono pubblicate nelle <a href="https://github.com/Nisiix/Project-goal-manager/releases">Release su GitHub</a>.</p>' })
  }
})()
