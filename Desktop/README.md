# Project Goal Manager

App desktop (Tauri 2 + Vue 3), in italiano e in inglese, per gestire la roadmap di uno o più progetti: elementi con titolo, descrizione, priorità, stato, scadenza, etichetta e assegnatario; completati e cestino; filtri; commenti e domande con @menzioni; allegati con anteprima interna; cartelle e sottocartelle, preferiti e recenti; ruoli (admin, Cleaner, membro), notifiche configurabili e cronologia delle operazioni; sincronizzazione in sola lettura di una cartella di Google Drive; per ogni progetto stack tecnologico con configurazione guidata, riusabile come modello per i progetti nuovi (con creazione della cartella del progetto e dei file iniziali), e strumenti AI. I dati vivono in una cartella, locale o di rete condivisa (anche su percorso mappato tipo `Z:\Roadmap`), senza alcun server.

Le specifiche complete sono in [PROGETTO.md](./PROGETTO.md); la struttura del codice, le convenzioni e i test in [ARCHITETTURA.md](./ARCHITETTURA.md).

## Requisiti (Windows)

- [Node.js](https://nodejs.org) 20 o superiore
- [Rust](https://www.rust-lang.org/tools/install) (rustup, toolchain stable) + Visual Studio Build Tools con il workload "Desktop development with C++"
- Microsoft Edge WebView2 (già incluso in Windows 10/11)

## Avvio

```bash
npm install
npm run tauri dev
```

Il primo avvio compila il backend Rust (qualche minuto); i successivi sono rapidi.

Per provare solo l'interfaccia nel browser, senza Rust: `npm run dev` (o `npm run dev:en` in inglese) e apri http://localhost:1420 — in questa modalità il filesystem è simulato in memoria.

## Build dell'eseguibile

```bash
npm run tauri:build:it   # app in italiano (equivale a npm run tauri build)
npm run tauri:build:en   # app in inglese
```

L'installer (`.msi` e `.exe`) e l'eseguibile si trovano in `src-tauri/target/release/bundle/`. La lingua è decisa in fase di build: ogni installer contiene una sola lingua (vedi [ARCHITETTURA.md](./ARCHITETTURA.md), «Lingue»).

## Test

```bash
npm test              # unit + componenti (Vitest)
npm run test:e2e      # end-to-end (Playwright; la prima volta: npx playwright install chromium)
npm run test:all      # typecheck + unit + e2e
```

### Build automatica su GitHub

Il workflow `.github/workflows/build-windows.yml` (nella radice del repository) compila l'installer su un runner Windows a ogni push su `main` (o manualmente da Actions → "Build Windows" → Run workflow) dopo aver eseguito typecheck e test. La build gira due volte, una per lingua: gli artefatti `project-goal-manager-windows-it` e `-en` contengono `.msi`, setup `.exe` ed eseguibile portabile con la lingua nel nome (`Project-Goal-Manager_<versione>_x64_<lingua>.msi`, `…-setup.exe`, `…-portable.exe`). Con un tag `v*` (es. `git tag v0.1.0 && git push --tags`) viene creata anche una Release con tutti i file: la sezione download del sito li trova da sola.

Per pubblicare il progetto:

Il repository è `Nisiix/Project-goal-manager`: ogni push su `main` che tocca `Desktop/` avvia la build.

### Build locale con uno script

`scripts\build-windows.cmd` (doppio click) controlla Node e Rust, esegue `npm install` e `npm run tauri build`, e scrive tutto in `build.log`. Con un argomento sceglie la lingua: `scripts\build-windows.cmd en`.

### Schermate del sito

`node scripts/screenshots.mjs` (oppure `… it` / `… en`) compila l'app nella lingua, inserisce dati di esempio generici dall'interfaccia (con Microsoft Edge tramite Playwright) e salva le schermate della landing in `../Web/assets/screens/<lingua>/`.

## Struttura

```
src/
  services/   fs.ts (plugin Tauri + fallback in memoria), storage.ts (file JSON del workspace,
              mutazioni read-before-write), crypto.ts (PBKDF2 + AES-GCM), config.ts (dati locali)
  stores/     workspace.ts (stato, aggiornamento live via watcher + polling), session.ts, ui.ts
  components/ ui/ board/ detail/ layout/ dialogs/
  views/      Welcome, Workspace (home, progetto, membri)
src-tauri/    backend Rust minimale: comando get_identity + plugin fs/dialog/opener/os/window-state
```

## Come funziona la condivisione in rete

1. Un utente crea un workspace scegliendo una cartella condivisa e la modalità "Condiviso in rete" con una password: diventa amministratore.
2. I colleghi aprono la stessa cartella da "Apri cartella": alla prima apertura inseriscono la password, che viene verificata e memorizzata cifrata sul loro PC.
3. Ogni progetto è un file JSON separato. Ogni modifica rilegge il file, applica la modifica e riscrive in modo atomico, così le modifiche di più persone si sommano.
4. Un watcher sulla cartella più un controllo ogni 4 secondi ricaricano solo i file cambiati; l'interfaccia si aggiorna da sola e segnala "Aggiornato da …".

## Scorciatoie

| Tasto | Azione |
|---|---|
| `N` | Nuovo elemento nel progetto aperto |
| `Ctrl+K` | Cerca |
| `Ctrl+Shift+L` | Tema chiaro/scuro |
| `Esc` | Chiude il pannello di dettaglio |
| `Invio` / `Shift+Invio` | Pubblica commento / a capo |
