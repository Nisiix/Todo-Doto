# Project Goal Manager

Monorepo del progetto.

| Cartella | Contenuto |
|---|---|
| [`Desktop/`](./Desktop) | L'applicazione desktop (Tauri 2 + Vue 3): codice, test, documentazione ([PROGETTO.md](./Desktop/PROGETTO.md), [ARCHITETTURA.md](./Desktop/ARCHITETTURA.md)) e script di build |
| [`Web/`](./Web) | Il sito dell'applicazione: landing page statica con schermate, sezione download e pagine legali (termini, privacy, condizioni) |
| `.github/workflows/` | Build automatica dell'installer Windows a ogni push su `main` e Release sui tag `v*` |

## Avvio rapido

```bash
cd Desktop
npm install
npm run tauri dev      # app con ricarica automatica
npm run test:all       # typecheck + unit + end-to-end
npm run tauri build    # installer in Desktop/src-tauri/target/release/bundle/
```

Il sito in `Web/` è statico: si apre con un qualsiasi server web (per provarlo in locale `npx serve Web` o `python -m http.server` dentro `Web/`). La sezione download legge `Web/downloads/manifest.json` se presente (vedi `Web/downloads/README.md`); finché il server di download non c'è, i pulsanti rimandano alle Release su GitHub.
