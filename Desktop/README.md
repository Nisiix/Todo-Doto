# Project Goal Manager

App desktop (Tauri 2 + Vue 3) per gestire la roadmap di uno o più progetti: elementi con titolo, descrizione, priorità, stato, scadenza ed etichetta; completati e cestino; filtri; commenti e domande con @menzioni; allegati con anteprima interna; cartelle e sottocartelle, preferiti e recenti; ruoli (admin, Cleaner, membro), notifiche configurabili e cronologia delle operazioni; sincronizzazione in sola lettura di una cartella di Google Drive; export CSV e stampa/PDF; backup automatici; aggiornamenti automatici. I dati vivono in una cartella, locale o di rete condivisa (anche su percorso mappato tipo `Z:\Roadmap`), senza alcun server. Piani Free / Team / Business con licenza verificata in locale (vedi «Piani e licenze»).

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

Per provare solo l'interfaccia nel browser, senza Rust: `npm run dev` e apri http://localhost:1420 — in questa modalità il filesystem è simulato in memoria.

## Build dell'eseguibile

```bash
npm run tauri build
```

L'installer (`.msi` e `.exe`) e l'eseguibile si trovano in `src-tauri/target/release/bundle/`.

## Test

```bash
npm test              # unit + componenti (Vitest)
npm run test:e2e      # end-to-end (Playwright; la prima volta: npx playwright install chromium)
npm run test:all      # typecheck + unit + e2e
```

### Build automatica su GitHub

Il workflow `.github/workflows/build-windows.yml` (nella radice del repository) compila l'installer su un runner Windows a ogni push su `main` che tocca `Desktop/` (o manualmente da Actions → "Build Windows" → Run workflow) dopo typecheck, test unitari ed end-to-end. Il risultato è scaricabile come artefatto `project-goal-manager-windows`; con un tag `v*` (es. `git tag v0.2.0 && git push --tags`) viene creata anche una Release con `.msi`, setup `.exe`, `latest.json` (updater) e `SHA256SUMS.txt`. Segreti e firma del codice: vedi il README nella radice.

### Aggiornamenti automatici

Plugin `updater` di Tauri: all'avvio (dopo 4 s) l'app legge `latest.json` dall'ultima Release su GitHub (endpoint in `src-tauri/tauri.conf.json`); se c'è una versione nuova compare un toast con «Installa», oppure si controlla da Impostazioni → Informazioni. I pacchetti sono firmati con `~/.tauri/project-goal-manager.key` (la chiave pubblica è nel `tauri.conf.json`): senza la chiave privata nel segreto `TAURI_SIGNING_PRIVATE_KEY` la Release non è installabile dall'updater. Una licenza perpetua installa solo versioni pubblicate entro `updatesUntil`.

### Lingua

Interfaccia in italiano o inglese: le stringhe italiane sono le chiavi, `src/i18n/en.ts` le traduzioni (`t('…')`, `tn(n, '…', '…')` da `@/i18n`). La lingua segue il sistema o la scelta in Impostazioni → Lingua. `node scripts/i18n-check.mjs` elenca le chiavi senza traduzione; `scripts/i18n-wrap.mjs` è lo strumento usato per l'estrazione iniziale.

### Piani e licenze

| Piano | Posti in rete | In più |
|---|---|---|
| Free | 3 | tutto il resto, uso locale illimitato |
| Team (49,90 €/anno o 5,90 €/mese) | 10 | progetti riservati, Cleaner, cronologia 90 giorni, export CSV/PDF, backup, Drive |
| Business (149,90 €/anno o 14,90 €/mese) | illimitati | cronologia illimitata con export, timeline delle scadenze |

La licenza è `license.json` nella cartella del workspace, firmata Ed25519 e verificata in locale (`services/license.ts`, chiave pubblica incorporata). Si emette con `node scripts/license-keygen.mjs` (una volta) e `node scripts/issue-license.mjs --plan team --to "Studio Rossi" --email … --out license.json`, oppure automaticamente dal server in `tools/license-server/`. Senza licenza, oltre i 3 membri in rete l'amministratore può avviare la prova di 14 giorni (`trial.json`); chi è oltre i posti lavora in sola lettura. La logica è in `services/license.ts` (pura, testata) e nello store (`plan`, `can(feature)`, `canWrite`).

### Build locale con uno script

`scripts\build-windows.cmd` (doppio click) controlla Node e Rust, esegue `npm install` e `npm run tauri build`, e scrive tutto in `build.log`.

## Struttura

```
src/
  services/   fs.ts (plugin Tauri + fallback in memoria), storage.ts (file JSON del workspace,
              mutazioni read-before-write, backup), crypto.ts (PBKDF2 + AES-GCM), config.ts (dati locali),
              license.ts (piani, posti, verifica Ed25519), export.ts (CSV), updater.ts, diagnostics.ts,
              demo.ts (workspace di esempio), changelog.ts, branding.ts (versione, URL, email)
  stores/     workspace.ts (stato, mutazioni, piano e licenza, aggiornamento live), session.ts, ui.ts,
              updates.ts (aggiornamenti), notifications.ts, drive.ts
  components/ ui/ board/ detail/ layout/ (PlanBanner) dialogs/ (LicenseDialog, SettingsDialog, WhatsNewDialog)
  views/      Welcome (primi passi, esempio), Workspace (home, progetto, membri, Drive, cronologia), Print
scripts/      build-windows.cmd, license-keygen.mjs, issue-license.mjs
src-tauri/    backend Rust minimale: get_identity, ricevitore OAuth + plugin fs/dialog/opener/os/http/updater/process/window-state
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
