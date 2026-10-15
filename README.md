# Todo Doto

Monorepo del progetto.

| Cartella | Contenuto |
|---|---|
| [`Desktop/`](./Desktop) | L'applicazione desktop (Tauri 2 + Vue 3), in italiano e in inglese: codice, test, documentazione ([PROGETTO.md](./Desktop/PROGETTO.md), [ARCHITETTURA.md](./Desktop/ARCHITETTURA.md)) e script di build |
| [`Web/`](./Web) | Il sito dell'applicazione, in italiano e in inglese: landing page statica, sezione download con l'installer nella lingua scelta e pagine legali (termini, privacy, condizioni) |
| `.github/workflows/` | `build-windows.yml`: build automatica degli installer Windows (italiano e inglese) a ogni push su `main` e Release sui tag `v*` · `site.yml`: pubblica `Web/` su GitHub Pages |
| [`PIANO-LANCIO.md`](./PIANO-LANCIO.md) | Posizionamento, prezzi per funzionalità, calendario di lancio e marketing (con fonti) |
| [`GUIDA-OPERATIVA.md`](./GUIDA-OPERATIVA.md) | Procedure passo per passo per dominio ed email, segreti GitHub, certificato OV, Merchant of Record (Paddle) e winget |

## Avvio rapido

```bash
cd Desktop
npm install
npm run tauri dev      # app con ricarica automatica
npm run test:all       # typecheck + unit + end-to-end
npm run tauri:build:it # installer (app in italiano) in Desktop/src-tauri/target/release/bundle/
npm run tauri:build:en # installer con l'app in inglese
npm run tauri:exe:it   # solo l'eseguibile portabile, senza installer
```

Il sito in `Web/` è statico: si apre con un qualsiasi server web (per provarlo in locale `npx serve Web` o `python -m http.server` dentro `Web/`). La lingua del sito si sceglie in alto (IT/EN) e determina l'installer proposto nella sezione download, che legge `Web/downloads/manifest.json` se presente oppure l'ultima Release su GitHub (vedi `Web/downloads/README.md`). Le schermate si rigenerano con `node Desktop/scripts/screenshots.mjs`. La pagina «Novità» del sito legge `Desktop/CHANGELOG.md` (copiato dal workflow `site.yml`).
