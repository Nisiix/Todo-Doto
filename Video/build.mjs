// Video tutorial del sito con HyperFrames (https://hyperframes.heygen.com).
//
// Per ogni tutorial e lingua genera un progetto HyperFrames in build/<lingua>/<id>/
// (composizione HTML con timeline GSAP): i fotogrammi dell'app (frames/<lingua>/,
// prodotti da ../Desktop/scripts/screenshots.mjs) in una finestra, con zoom sulla
// zona da mostrare, evidenziazione e didascalia. Con --render li verifica
// (`hyperframes check`) e li esporta in MP4 nel sito: ../Web/assets/video/<lingua>/<id>.mp4,
// più l'immagine di anteprima <id>.jpg.
//
// Uso:  node build.mjs                 genera solo i progetti (da aprire con `npx hyperframes preview`)
//       node build.mjs --render        genera, verifica ed esporta tutto
//       node build.mjs --render it     una sola lingua (si può indicare anche l'id di un tutorial)
// Per il rendering serve Chrome: se `npx hyperframes browser ensure` non può scaricarlo,
// HYPERFRAMES_BROWSER_PATH=/percorso/chrome (o headless_shell).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = dirname(fileURLToPath(import.meta.url))
const HF = 'hyperframes@0.8.181'
const CONTENT = JSON.parse(readFileSync(join(ROOT, 'tutorials.json'), 'utf8'))
const LANGS = ['it', 'en']

// Tempi (secondi)
const INTRO = 2.8
const STEP = 5.4
const FADE = 0.5
const OUTRO = 3.2

// Geometria: finestra dell'app 1400×875 (schermata 1600×1000 al 87,5%), didascalia sotto
const SHOT = { w: 1600, h: 1000 }
const VIEW = { w: 1400, h: 875 }
const K = VIEW.w / SHOT.w
const CARD = { x: (1920 - VIEW.w) / 2, y: 34, bar: 34 }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Zoom e spostamento per portare al centro la zona indicata, senza mostrare i bordi. */
export function camera(box) {
  if (!box) return { z: 1.05, x: (VIEW.w - VIEW.w * 1.05) / 2, y: (VIEW.h - VIEW.h * 1.05) / 2, spot: null }
  const b = { x: box.x * K, y: box.y * K, w: box.w * K, h: box.h * K }
  let z = Math.min(1.85, (0.8 * VIEW.w) / b.w, (0.8 * VIEW.h) / b.h)
  z = Math.max(1.06, z)
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const x = clamp(VIEW.w / 2 - cx * z, VIEW.w - VIEW.w * z, 0)
  const y = clamp(VIEW.h / 2 - cy * z, VIEW.h - VIEW.h * z, 0)
  const pad = 8
  return { z: +z.toFixed(4), x: Math.round(x), y: Math.round(y), spot: { x: Math.round(b.x - pad), y: Math.round(b.y - pad), w: Math.round(b.w + pad * 2), h: Math.round(b.h + pad * 2) } }
}

const LOGO = `<svg viewBox="0 0 28 28" width="100%" height="100%" aria-hidden="true">
  <rect class="bar" x="2" y="12" width="4" height="14" rx="1.5" fill="#7fa98f" />
  <rect class="bar" x="9" y="2" width="4" height="24" rx="1.5" fill="#d9a441" />
  <rect class="bar" x="16" y="2" width="4" height="24" rx="1.5" fill="#e07a3f" />
  <rect class="bar" x="23" y="12" width="4" height="14" rx="1.5" fill="#d64545" />
</svg>`

function composition(lang, t) {
  const boxes = JSON.parse(readFileSync(join(ROOT, 'frames', lang, 'boxes.json'), 'utf8')).boxes
  const head = t[lang]
  const outro = CONTENT.outro[lang]
  const n = t.steps.length
  const stepStart = (i) => INTRO + i * STEP
  const outroStart = INTRO + n * STEP
  const total = +(outroStart + OUTRO).toFixed(2)
  const id = `tut-${t.id}`

  const steps = t.steps
    .map((s, i) => {
      const start = stepStart(i)
      return `
      <section id="s${i}" class="clip step" data-start="${start}" data-duration="${STEP + FADE}" data-track-index="${1 + (i % 2)}">
        <div class="stage" id="s${i}-stage">
          <div class="card">
            <div class="card__bar" data-layout-allow-overlap><i></i><i></i><i></i><span>Todo Doto</span></div>
            <div class="view">
              <div class="cam" id="s${i}-cam" data-layout-allow-overflow>
                <img src="frames/${s.frame}.png" width="${VIEW.w}" height="${VIEW.h}" alt="" />
                <div class="spot" id="s${i}-spot"></div>
              </div>
            </div>
          </div>
          <div class="cap" id="s${i}-cap" data-layout-allow-overlap>
            <span class="cap__num">${i + 1}<small>/${n}</small></span>
            <p class="cap__text">${esc(s[lang])}</p>
          </div>
        </div>
      </section>`
    })
    .join('\n')

  const motion = t.steps
    .map((s, i) => {
      const t0 = stepStart(i)
      const cam = camera(s.box ?? boxes[s.frame])
      const r = cam.spot
      const spot = r
        ? `gsap.set('#s${i}-spot', { left: ${r.x}, top: ${r.y}, width: ${r.w}, height: ${r.h} });
      tl.fromTo('#s${i}-spot', { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power1.out' }, ${(t0 + 2.05).toFixed(2)});`
        : `gsap.set('#s${i}-spot', { display: 'none' });`
      return `
      // Passo ${i + 1}: entra, poi zoom sulla zona e evidenziazione
      tl.fromTo('#s${i}-stage', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: ${FADE}, ease: 'power2.out' }, ${t0.toFixed(2)});
      tl.fromTo('#s${i}-cap', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, ${(t0 + 0.25).toFixed(2)});
      tl.to('#s${i}-cap', { opacity: 0, duration: 0.3, ease: 'power1.in' }, ${(t0 + STEP - 0.15).toFixed(2)});
      tl.fromTo('#s${i}-cam', { scale: 1, x: 0, y: 0 }, { scale: ${cam.z}, x: ${cam.x}, y: ${cam.y}, duration: 1.3, ease: 'power2.inOut' }, ${(t0 + 0.8).toFixed(2)});
      tl.to('#s${i}-cam', { scale: ${(cam.z * 1.025).toFixed(4)}, x: ${Math.round(cam.x - (VIEW.w / 2) * cam.z * 0.025)}, y: ${Math.round(cam.y - (VIEW.h / 2) * cam.z * 0.025)}, duration: ${(STEP + FADE - 2.1).toFixed(2)}, ease: 'none' }, ${(t0 + 2.1).toFixed(2)});
      ${spot}`
    })
    .join('\n')

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>${esc(head.title)} — Todo Doto</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Manrope'; font-weight: 400; src: url('assets/fonts/manrope-400.woff2') format('woff2'); }
      @font-face { font-family: 'Manrope'; font-weight: 600; src: url('assets/fonts/manrope-600.woff2') format('woff2'); }
      @font-face { font-family: 'Manrope'; font-weight: 800; src: url('assets/fonts/manrope-800.woff2') format('woff2'); }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #f3f1ec; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: 'Manrope', sans-serif; color: #1c1f26; }
      .bg { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 18% 0%, #dceff9 0%, rgba(220, 239, 249, 0) 70%), radial-gradient(900px 600px at 100% 100%, #f6e6d6 0%, rgba(246, 230, 214, 0) 70%), #f3f1ec; }
      .clip { position: absolute; inset: 0; }
      /* Apertura e chiusura */
      .title { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .title__logo { width: 120px; height: 120px; margin-bottom: 34px; }
      .title__kicker { font-size: 30px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #1b79b0; }
      .title__h { margin-top: 14px; font-size: 96px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.04; }
      .title__sub { margin-top: 22px; font-size: 38px; font-weight: 400; color: #555963; }
      .title__url { margin-top: 40px; display: inline-block; padding: 16px 34px; border-radius: 999px; background: #2a95d2; color: #fff; font-size: 34px; font-weight: 600; }
      /* Passi */
      .stage { position: absolute; inset: 0; }
      .card { position: absolute; left: ${CARD.x}px; top: ${CARD.y}px; width: ${VIEW.w}px; height: ${VIEW.h + CARD.bar}px; border-radius: 16px; overflow: hidden; background: #faf9f6; box-shadow: 0 40px 90px -40px rgba(28, 31, 38, 0.55), 0 0 0 1px rgba(28, 31, 38, 0.08); }
      .card__bar { height: ${CARD.bar}px; display: flex; align-items: center; gap: 8px; padding: 0 16px; background: #ebe8e1; border-bottom: 1px solid #dcd8cf; }
      .card__bar i { width: 12px; height: 12px; border-radius: 50%; background: #c6c1b6; }
      .card__bar span { margin-left: 10px; font-size: 15px; font-weight: 600; color: #65686f; }
      .view { position: relative; width: ${VIEW.w}px; height: ${VIEW.h}px; overflow: hidden; }
      .cam { position: absolute; left: 0; top: 0; width: ${VIEW.w}px; height: ${VIEW.h}px; transform-origin: 0 0; }
      .cam img { display: block; width: ${VIEW.w}px; height: ${VIEW.h}px; }
      .spot { position: absolute; left: 0; top: 0; width: 10px; height: 10px; border-radius: 12px; border: 3px solid #2a95d2; box-shadow: 0 0 0 4000px rgba(28, 31, 38, 0.26), 0 0 0 7px rgba(42, 149, 210, 0.22); opacity: 0; }
      .cap { position: absolute; left: ${CARD.x}px; width: ${VIEW.w}px; top: ${CARD.y + VIEW.h + CARD.bar + 22}px; height: 100px; display: flex; align-items: center; gap: 22px; }
      .cap__num { flex: none; min-width: 92px; height: 64px; padding: 0 16px; border-radius: 14px; background: #2a95d2; color: #fff; font-size: 34px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
      .cap__num small { font-size: 22px; font-weight: 600; opacity: 0.75; margin-left: 2px; }
      .cap__text { font-size: 34px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${id}" data-start="0" data-duration="${total}" data-width="1920" data-height="1080" data-fps="30">
      <div class="bg"></div>
      <section id="intro" class="clip title" data-start="0" data-duration="${INTRO + FADE}" data-track-index="0">
        <div class="title__logo" id="intro-logo">${LOGO}</div>
        <p class="title__kicker" id="intro-kicker">${esc(head.kicker)}</p>
        <h1 class="title__h" id="intro-title">${esc(head.title)}</h1>
        <p class="title__sub" id="intro-sub">${esc(head.subtitle)}</p>
      </section>
${steps}
      <section id="outro" class="clip title" data-start="${outroStart}" data-duration="${OUTRO}" data-track-index="3">
        <div class="title__logo" id="outro-logo">${LOGO}</div>
        <h1 class="title__h" id="outro-title">${esc(outro.title)}</h1>
        <p class="title__sub" id="outro-sub">${esc(outro.subtitle)}</p>
        <p><span class="title__url" id="outro-url">${esc(outro.url)}</span></p>
      </section>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // Apertura: le barre del logo crescono, poi i testi
      tl.fromTo('#intro-logo .bar', { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.6, ease: 'back.out(1.6)', stagger: 0.08 }, 0.15);
      tl.fromTo('#intro-kicker', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.5);
      tl.fromTo('#intro-title', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.65);
      tl.fromTo('#intro-sub', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.9);
      tl.to('#intro-logo, #intro-kicker, #intro-title, #intro-sub', { opacity: 0, y: -16, duration: ${FADE}, ease: 'power2.in' }, ${(INTRO - 0.1).toFixed(2)});
${motion}
      // Chiusura
      tl.fromTo('#outro-logo .bar', { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.6, ease: 'back.out(1.6)', stagger: 0.08 }, ${(outroStart + 0.1).toFixed(2)});
      tl.fromTo('#outro-title', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, ${(outroStart + 0.35).toFixed(2)});
      tl.fromTo('#outro-sub', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, ${(outroStart + 0.6).toFixed(2)});
      tl.fromTo('#outro-url', { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)' }, ${(outroStart + 0.85).toFixed(2)});
      window.__timelines['${id}'] = tl;
    </script>
  </body>
</html>
`
}


function project(lang, t) {
  const dir = join(ROOT, 'build', lang, t.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'frames'), { recursive: true })
  mkdirSync(join(dir, 'assets', 'fonts'), { recursive: true })
  for (const s of t.steps) {
    const src = join(ROOT, 'frames', lang, `${s.frame}.png`)
    if (!existsSync(src)) throw new Error(`Manca il fotogramma ${src}: esegui prima npm run frames`)
    cpSync(src, join(dir, 'frames', `${s.frame}.png`))
  }
  cpSync(join(ROOT, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(dir, 'assets', 'gsap.min.js'))
  for (const w of [400, 600, 800]) cpSync(join(ROOT, 'node_modules', '@fontsource', 'manrope', 'files', `manrope-latin-${w}-normal.woff2`), join(dir, 'assets', 'fonts', `manrope-${w}.woff2`))
  writeFileSync(join(dir, 'index.html'), composition(lang, t))
  writeFileSync(join(dir, 'hyperframes.json'), JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { assets: 'assets' } }, null, 2))
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id: `${t.id}-${lang}`, name: `${t[lang].title} (${lang})` }, null, 2))
  return dir
}

const hf = (args, cwd) => execFileSync('npx', ['--yes', HF, ...args], { cwd, stdio: 'inherit', env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1' } })

const args = process.argv.slice(2)
const render = args.includes('--render')
const langs = args.filter((a) => LANGS.includes(a))
const only = args.filter((a) => CONTENT.tutorials.some((t) => t.id === a))
for (const lang of langs.length ? langs : LANGS) {
  for (const t of CONTENT.tutorials.filter((x) => !only.length || only.includes(x.id))) {
    const dir = project(lang, t)
    console.log(`Progetto ${lang}/${t.id}: ${dir}`)
    if (!render) continue
    hf(['check'], dir)
    const outDir = join(ROOT, '..', 'Web', 'assets', 'video', lang)
    mkdirSync(outDir, { recursive: true })
    const mp4 = join(outDir, `${t.id}.mp4`)
    // Schermate dell'app: un CRF più alto pesa poco sul sito e resta nitido
    hf(['render', '--crf', '26', '--output', mp4], dir)
    // Avvio veloce nel browser (moov all'inizio) e immagine di anteprima sul titolo
    const tmp = `${mp4}.tmp.mp4`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-c', 'copy', '-movflags', '+faststart', tmp])
    cpSync(tmp, mp4)
    rmSync(tmp)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2.1', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '4', join(outDir, `${t.id}.jpg`)])
    console.log(`  → ${mp4}`)
  }
}
