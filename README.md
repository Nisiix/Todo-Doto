# Project Goal Manager

Monorepo del progetto.

| Cartella | Contenuto |
|---|---|
| [`Desktop/`](./Desktop) | L'applicazione desktop (Tauri 2 + Vue 3), in italiano e in inglese: codice, test, documentazione ([PROGETTO.md](./Desktop/PROGETTO.md), [ARCHITETTURA.md](./Desktop/ARCHITETTURA.md)) e script di build |
| [`Web/`](./Web) | Il sito dell'applicazione, in italiano e in inglese: landing page statica, sezione download con l'installer nella lingua scelta e pagine legali (termini, privacy, condizioni) |
| `.github/workflows/` | Build automatica degli installer Windows (italiano e inglese) a ogni push su `main` e Release sui tag `v*` |

## Avvio rapido

```bash
cd Desktop
npm install
npm run tauri dev      # app con ricarica automatica
npm run test:all       # typecheck + unit + end-to-end
npm run tauri:build:it # installer (app in italiano) in Desktop/src-tauri/target/release/bundle/
npm run tauri:build:en # installer con l'app in inglese
```

Il sito in `Web/` è statico: si apre con un qualsiasi server web (per provarlo in locale `npx serve Web` o `python -m http.server` dentro `Web/`). La lingua del sito si sceglie in alto (IT/EN) e determina l'installer proposto nella sezione download, che legge `Web/downloads/manifest.json` se presente oppure l'ultima Release su GitHub (vedi `Web/downloads/README.md`). Le schermate si rigenerano con `node Desktop/scripts/screenshots.mjs`.
