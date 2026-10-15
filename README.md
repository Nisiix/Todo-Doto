# Project Goal Manager

Monorepo del progetto.

| Cartella | Contenuto |
|---|---|
| [`Desktop/`](./Desktop) | L'applicazione desktop (Tauri 2 + Vue 3): codice, test, documentazione ([PROGETTO.md](./Desktop/PROGETTO.md), [ARCHITETTURA.md](./Desktop/ARCHITETTURA.md)), [CHANGELOG.md](./Desktop/CHANGELOG.md), script di build e di emissione licenze |
| [`Web/`](./Web) | Il sito: landing page con prezzi e FAQ, guida, novità, confronti (vs Trello, vs Excel), versione inglese (`en/`), pagine legali |
| [`tools/license-server/`](./tools/license-server) | Cloudflare Worker che trasforma un ordine pagato (Paddle / Lemon Squeezy) in una licenza firmata inviata per email |
| `.github/workflows/` | `build-windows.yml`: typecheck, test, build dell'installer, Release sui tag `v*` con updater e SHA-256 · `site.yml`: pubblica `Web/` su GitHub Pages e aggiorna il manifest dei download |
| [`PIANO-LANCIO.md`](./PIANO-LANCIO.md) | Piano di completamento del prodotto, prezzi per funzionalità, calendario di lancio e marketing (con fonti) e stato di avanzamento |
| [`GUIDA-OPERATIVA.md`](./GUIDA-OPERATIVA.md) | Procedure passo per passo per dominio ed email, segreti GitHub, certificato OV, Merchant of Record (Paddle) e winget |

## Avvio rapido

```bash
cd Desktop
npm install
npm run tauri dev      # app con ricarica automatica
npm run test:all       # typecheck + unit + end-to-end
npm run tauri build    # installer in Desktop/src-tauri/target/release/bundle/
```

Il sito in `Web/` è statico: per provarlo in locale `npx serve Web` oppure `python -m http.server` dentro `Web/`.

## Pubblicare

```bash
git add . && git commit -m "Project Goal Manager 0.2.0"
gh repo create Nisiix/Project-goal-manager --private --source . --push
```

Poi, su GitHub → Settings:

1. **Secrets and variables → Actions**: `TAURI_SIGNING_PRIVATE_KEY` (contenuto di `~/.tauri/project-goal-manager.key`), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (vuoto), e quando c'è il certificato OV `WINDOWS_CERT_PFX_BASE64` + `WINDOWS_CERT_PASSWORD`.
2. **Pages → Source = GitHub Actions** (il workflow `site.yml` pubblica `Web/`).
3. Una release: `git tag v0.2.0 && git push --tags` → installer, `latest.json` per l'updater e `SHA256SUMS.txt` nella Release; il sito si aggiorna da solo.

## Chiavi (fuori dal repository, da conservare con un backup)

| File | Uso |
|---|---|
| `~/.tauri/project-goal-manager.key` | firma dei pacchetti di aggiornamento (la pubblica è in `Desktop/src-tauri/tauri.conf.json`) |
| `~/.pgm/license-signing.key` | firma delle licenze (la pubblica è in `Desktop/src/services/license.ts`) |

Se si perdono, gli utenti esistenti non ricevono più aggiornamenti (prima) o le licenze emesse non valgono più (seconda).

## Emettere una licenza a mano

```bash
cd Desktop
node scripts/issue-license.mjs --plan team --to "Studio Rossi" --email info@studiorossi.it --out license.json
```

Il cliente la attiva da menu del workspace → Piano e licenza (incolla o scegli file). Per la vendita automatica vedi `tools/license-server/README.md`.
