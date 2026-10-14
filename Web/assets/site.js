// Tema chiaro/scuro (come nell'app: Ctrl+Shift+L o il pulsante) e sezione download.
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

  // Download: legge downloads/manifest.json se presente (server web da aggiungere).
  // Finché non c'è, i pulsanti rimandano alle Release su GitHub.
  const box = document.querySelector('[data-download]')
  if (!box) return
  const releases = box.dataset.releases
  const note = box.querySelector('.dl-note')
  fetch('downloads/manifest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
    .then((m) => {
      box.querySelectorAll('[data-kind]').forEach((a) => {
        const f = m.files && m.files[a.dataset.kind]
        if (f) { a.href = 'downloads/' + f.name; a.removeAttribute('aria-disabled'); a.dataset.size = f.size || '' }
      })
      const ver = box.querySelector('.ver')
      if (ver && m.version) ver.textContent = `Versione ${m.version} · Windows 10/11 (64 bit)` + (m.date ? ` · ${m.date}` : '')
      if (note) note.hidden = true
    })
    .catch(() => {
      box.querySelectorAll('[data-kind]').forEach((a) => { a.href = releases })
      if (note) note.hidden = false
    })
})()
