# Project Goal Manager — documento di progetto

Applicazione desktop per gestire la roadmap di uno o più progetti, in locale o in rete aziendale, con dati condivisi su una cartella di un server (anche raggiunta da un percorso di rete mappato, es. `Z:\Roadmap`).

---

## 1. Obiettivo

Un'app leggera, veloce e bella da usare che permetta in pochi click di:

- tenere una lista di cose da fare per ogni progetto, con priorità, stato e scadenza;
- spostare gli elementi tra **Da fare → Completati** e **Da fare → Cestino** (con eliminazione definitiva solo dal cestino);
- organizzare i progetti in **cartelle e sottocartelle**, segnarli come **preferiti** e ritrovare i **recenti**;
- cestinare e ripristinare interi progetti (**Cestino** del workspace); l'eliminazione definitiva è riservata ad amministratori e **Cleaner**;
- dare a ogni elemento titolo, descrizione, priorità, stato, scadenza e un'**etichetta** (badge personalizzabile per nome e colore);
- **filtrare** la lista per scadenza (da/a), stato, priorità, utente ed etichetta;
- allegare file, link e documenti di **Google Drive**, organizzati in cartelle di allegati, e **vederli dentro l'app** (immagini, PDF, testo, pagine web);
- replicare la struttura di una cartella di Google Drive nel workspace (OAuth in sola lettura, token cifrato in locale);
- commentare, fare domande e rispondere dentro ogni elemento, taggando altri utenti della rete;
- ricevere **notifiche** interne (configurabili per tipo) sulle novità dei progetti di cui si fa parte;
- consultare, da amministratore, la **cronologia** delle operazioni su elementi e progetti (creazioni, completamenti, cestino, eliminazioni);
- lavorare in due modalità: **Locale** (dati solo sul proprio PC) o **Rete** (dati su una cartella condivisa, con password di accesso e gestione utenti);
- vedere sempre dati aggiornati anche quando altri colleghi modificano lo stesso progetto.

---

## 2. Stack tecnologico (scelto per interfaccia e velocità)

| Livello | Scelta | Perché |
|---|---|---|
| Shell desktop | **Tauri 2** (Rust) | Binario ~10 MB, avvio < 1 s, usa la WebView di sistema (WebView2 su Windows). Molto più leggero di Electron, accesso nativo al filesystem e ai percorsi di rete UNC/mappati. |
| UI | **Vue 3.5 + TypeScript + Vite 7** | Reattività fine-grained (`shallowRef`, `computed`), compilazione veloce, HMR istantaneo. Stack già usato nei tuoi altri progetti. |
| Stile | **Tailwind CSS 4** (`@tailwindcss/vite`) | Design token in CSS variables, tema chiaro/scuro con `@custom-variant dark`, zero runtime. |
| Componenti | **Reka UI** (headless, ex Radix Vue) | Dialog, menu, tooltip, select accessibili da tastiera senza imporre uno stile. |
| Icone | **lucide-vue-next** | Set coerente, tree-shakable. |
| Stato | **Pinia** | Store per workspace, progetti, utente corrente, UI. |
| Utility | **@vueuse/core**, **dayjs**, **nanoid**, **zod** | Debounce/watchers, date, id, validazione dei file JSON. |
| Font | **Manrope Variable** (self-hosted via `@fontsource-variable/manrope`) | Nessuna dipendenza da internet: l'app deve funzionare in LAN chiusa. |
| Plugin Tauri | `fs`, `dialog`, `opener`, `os`, `window-state` | Lettura/scrittura file (anche su rete), scelta cartelle, apertura allegati/link con l'app di sistema, identità macchina, ricordo posizione finestra. |
| Sicurezza | **Web Crypto API** (PBKDF2-SHA256, AES-GCM) | Hash della password del workspace e cifratura della password memorizzata localmente. Nessuna libreria esterna. |

### Plugin e skill esterne usate nello sviluppo

- **Tauri plugins** ufficiali (`@tauri-apps/plugin-*`) per non reinventare I/O, dialog e apertura file.
- **Reka UI** per i pattern di accessibilità (focus trap, aria, navigazione da tastiera).
- **Skill `frontend-design`** (Claude) per la direzione visiva: palette, tipografia, gerarchia, copy dell'interfaccia.
- **ESLint + Prettier + vue-tsc** per qualità e type-safety.

---

## 3. Architettura

```
┌──────────────────────────────────────────────────────────────┐
│  Finestra Tauri (WebView2)                                   │
│  ┌──────────────┐ ┌──────────────────────┐ ┌───────────────┐ │
│  │ Rail sinistra │ │ Board del progetto   │ │ Pannello      │ │
│  │ cartelle      │ │ Da fare / Completati │ │ dettaglio     │ │
│  │ categorie     │ │ / Cestino            │ │ commenti,     │ │
│  │ progetti      │ │                      │ │ domande,      │ │
│  └──────────────┘ └──────────────────────┘ │ allegati      │ │
│                                             └───────────────┘ │
│  Pinia stores  ──►  services/storage.ts  ──►  plugin-fs       │
│       ▲                    │                                   │
│       └── watcher + polling (aggiornamento live) ◄────────────┘
└──────────────────────────────────────────────────────────────┘
                    │
                    ▼
   Cartella workspace (locale o \\server\share\roadmap o Z:\roadmap)
```

Tutta la logica vive nel frontend; Rust espone solo un comando (`get_identity`: nome utente e nome macchina) e i plugin ufficiali. Niente database, niente server: **la "sorgente di verità" è una cartella di file JSON**, leggibile da qualunque PC che la vede.

---

## 4. Modello dati e formato su disco

```
<workspace>/
  workspace.json          identità del workspace, modalità, hash password
  users.json              utenti registrati nel workspace e ruolo
  tree.json               cartelle/sottocartelle e categorie
  projects/
    <projectId>.json      un file per progetto (todo, allegati, membri…)
```

Un file per progetto significa che due colleghi che lavorano su progetti diversi non si toccano mai; sullo stesso progetto il conflitto è gestito con **read-before-write + versione** (vedi §6).

### workspace.json
```jsonc
{
  "schema": 1,
  "id": "ws_…", "name": "Roadmap Sviluppo",
  "mode": "network",                // "local" | "network"
  "createdBy": "usr_…", "createdAt": "2026-10-13T21:00:00Z",
  "auth": { "salt": "base64", "hash": "base64", "iterations": 310000 }   // solo in modalità rete
}
```

### users.json
```jsonc
{ "users": [ { "id": "usr_…", "username": "mrossi", "hostname": "PC-MARIO",
               "displayName": "Mario Rossi", "role": "admin", "createdAt": "…" } ] }
```
L'identità di un utente è `username@hostname` (letti dal sistema operativo). Chi crea il workspace è `admin`; gli altri entrano come `member` dopo aver inserito la password.

### tree.json
```jsonc
{
  "folders": [ { "id": "fld_…", "name": "Clienti", "parentId": null, "order": 0 } ],
  "labels":  [ { "id": "lbl_…", "name": "Bug", "color": "#D64545" } ]     // etichette/badge del workspace
}
```

### audit.json — cronologia (append-only, ultimi 5000 eventi)
```jsonc
{ "entries": [ { "id": "aud_…", "at": "…", "userId": "usr_…", "action": "item_completed",
                 "projectId": "prj_…", "projectName": "…", "itemId": "itm_…", "itemTitle": "…", "count": null } ] }
```
Azioni registrate: `item_created | item_completed | item_reopened | item_trashed | item_restored | item_deleted | trash_emptied | project_created | project_trashed | project_restored | project_deleted`. Domande, risposte, commenti e descrizioni **non** vengono registrati.

### drive.json — struttura replicata di Google Drive (solo metadati)
```jsonc
{ "rootFolderId": "…", "rootName": "Documenti progetto", "syncedAt": "…", "syncedBy": "usr_…",
  "nodes": [ { "id": "…", "name": "Analisi.pdf", "mimeType": "application/pdf", "parentId": null,
               "modifiedTime": "…", "size": 12345, "webViewLink": "https://…" } ] }
```

### projects/<id>.json
```jsonc
{
  "schema": 1, "id": "prj_…", "name": "Bilancio Europeo Web",
  "description": "…", "folderId": "fld_…", "categoryId": "cat_…",
  "members": ["usr_…"],              // vuoto = visibile a tutti i membri del workspace
  "version": 42, "updatedAt": "…", "updatedBy": "usr_…",
  "items": [ {
      "id": "itm_…", "title": "Export XBRL", "notes": "…",
      "priority": "alta",             // bassa | media | alta | immediata
      "status": "confermato",         // da_valutare | da_definire | confermato
      "dueDate": "2026-11-30",        // facoltativa
      "bucket": "todo",               // todo | done | trash
      "createdAt": "…", "createdBy": "usr_…", "completedAt": null, "trashedAt": null,
      "comments":  [ { "id": "cmt_…", "authorId": "usr_…", "text": "…", "mentions": ["usr_…"], "createdAt": "…" } ],
      "questions": [ { "id": "qst_…", "authorId": "usr_…", "text": "…", "mentions": [], "createdAt": "…",
                       "resolved": false,
                       "answers": [ { "id": "ans_…", "authorId": "usr_…", "text": "…", "createdAt": "…" } ] } ]
  } ],
  "attachmentFolders": [ { "id": "afd_…", "name": "Specifiche" } ],
  "attachments": [ { "id": "att_…", "kind": "link", "name": "Figma", "target": "https://…",
                     "folderId": "afd_…", "addedBy": "usr_…", "addedAt": "…" },
                   { "id": "att_…", "kind": "file", "name": "Analisi.pdf", "target": "Z:\\docs\\Analisi.pdf",
                     "folderId": null, "addedBy": "usr_…", "addedAt": "…" } ]
}
```

### Dati locali (per macchina, in `%APPDATA%\com.nisos.projectgoalmanager\`)
```
config.json        tema, workspace recenti, preferiti per workspace, notifiche disattivate
credentials.json   password dei workspace di rete, cifrate con AES-GCM
drive-auth.json    ID client Google e token OAuth (solo lettura), cifrati con AES-GCM
```
Le notifiche ricevute restano in localStorage, per workspace e utente.

---

## 5. Funzionalità e flussi

### 5.1 Workspace
- **Schermata iniziale**: elenco workspace recenti + "Crea workspace" + "Apri workspace".
- **Crea**: nome, cartella (dialog nativo), modalità Locale o Rete. In modalità Rete è obbligatoria una password (min 6 caratteri); chi crea diventa admin.
- **Apri**: se `mode = network` e l'utente non è ancora in `users.json`, chiede la password; se corretta, l'utente viene aggiunto come `member` e la password viene salvata cifrata in locale (non richiesta ai prossimi avvii). L'admin può **cambiare la password** dalle impostazioni; i membri la reinseriscono al prossimo accesso.

### 5.2 Cartelle, categorie, progetti
- Albero cartelle a profondità libera nella rail sinistra; drag non necessario: ogni progetto ha un menu "Sposta in…".
- Categorie: nome e colore scelti dall'utente; filtro per categoria nella rail.
- Progetto: nome, descrizione, cartella, categoria, membri. Eliminazione con conferma.

### 5.3 Elementi da fare
- Creazione rapida con un solo campo (Invio per salvare); priorità/stato/scadenza modificabili inline dalla riga.
- Ordinamento: immediata → alta → media → bassa, poi scadenza, poi data creazione. Scadenze passate evidenziate.
- Azioni sulla riga: **Completa**, **Cestina**, dettaglio. Nel tab Completati: **Riapri**. Nel tab Cestino: **Ripristina**, **Elimina definitivamente** (conferma), **Svuota cestino**.

### 5.4 Dettaglio elemento (pannello destro)
- Note libere.
- **Commenti**: testo con `@nome` per taggare utenti del workspace (autocomplete).
- **Domande**: come i commenti ma con risposte annidate; solo l'autore (o un admin) può segnare **Risolta** → la domanda sparisce dalla lista aperta (resta consultabile in "Risolte").

### 5.5 Allegati
- Due tipi: **file** (percorso locale/di rete scelto da dialog o incollato) e **link** (URL). Si aprono con l'app di sistema o il browser.
- Cartelle di allegati con nome libero; spostamento tra cartelle dal menu dell'allegato.

### 5.6 Utenti e accesso
- Pagina "Membri": elenco utenti del workspace con ruolo; l'admin può promuovere/retrocedere e rimuovere.
- Per progetto: "Chi partecipa" — l'admin include/esclude utenti; un progetto senza membri espliciti è visibile a tutti. Chi non partecipa non vede il progetto.

---

## 6. Coerenza dei dati e aggiornamento dell'interfaccia

Problema: due PC aprono lo stesso progetto da una cartella di rete; uno modifica, l'altro mostra dati vecchi.

Soluzione a tre livelli:

1. **Scritture atomiche e read-before-write.** Ogni azione dell'utente è una *mutazione* `mutateProject(id, fn)`: si rilegge il file dal disco, si applica la modifica, si incrementa `version`, si scrive su `<id>.json.tmp` e si rinomina sopra l'originale. Non esiste mai uno stato "sporco" tenuto in memoria a lungo, quindi le modifiche di due persone si sommano invece di sovrascriversi.
2. **Watcher + polling.** Un watcher sulla cartella del workspace (plugin-fs `watch`) notifica i cambiamenti; dato che su SMB le notifiche possono non arrivare, ogni 4 s si confrontano anche `mtime`/`size` dei file. Quando un file cambia, lo store ricarica **solo quel file** e la UI si aggiorna grazie alla reattività di Vue.
3. **Segnalazione non invasiva.** Se il progetto aperto viene aggiornato da un altro utente, compare un toast "Aggiornato da Mario Rossi" e la riga modificata lampeggia; il pannello di dettaglio aperto viene ricaricato senza perdere il testo che si sta scrivendo (i campi in editing vengono riconciliati solo alla chiusura).

Errori di rete (percorso non raggiungibile) → banner "Cartella non raggiungibile, riprovo…" con retry automatico; l'app non si blocca.

---

## 7. UI / UX

### Direzione visiva
- **Tema chiaro "bianco sporco"**: sfondo `#F3F1EC`, superfici `#FAF9F6`, testo `#1C1F26`.
- **Tema scuro**: sfondo `#14161B`, superfici `#1C1F26`, testo `#E8E6E1`.
- **Accento celeste**: `#4FB3E8` (chiaro) / `#6CC3F0` (scuro), tinta morbida `#DCEFF9` / `#17384B`.
- Priorità: bassa `#7FA98F`, media `#D9A441`, alta `#E07A3F`, immediata `#D64545`.
- Font unico **Manrope** con numerali tabulari per date e contatori.
- Elemento distintivo: il bordo sinistro di ogni riga è una barra colorata la cui altezza cresce con la priorità; l'occhio legge la lista come un "istogramma" di urgenza senza bisogno di etichette.

### Layout (desktop ≥ 1024 px)
```
┌───────────────────────────────────────────────────────────────────┐
│ ⌂ Roadmap Sviluppo        🔍 cerca…            👥 Membri   ☾/☀   │
├──────────┬───────────────────────────────────────┬────────────────┤
│ Cartelle │ Bilancio Europeo Web        12 · 4 · 1 │ Export XBRL    │
│ ▸ Clienti│ [Da fare] [Completati] [Cestino]       │ priorità alta  │
│   ▸ Web  │ ┃ Export XBRL      alta  ● conf  30/11│ scadenza 30/11 │
│ Categorie│ ┃ Login SPID       imm.  ○ val.       │ ───────────── │
│ ● Gestio.│ ┃ Refactor NH      bassa ◐ def.       │ Commenti (2)   │
│          │ + aggiungi…                            │ Domande (1)    │
│ Progetti │                                        │ Allegati (3)   │
│ ○ BEW    │                                        │                │
└──────────┴───────────────────────────────────────┴────────────────┘
```
- Allineamento a sinistra ovunque; niente card nidificate: righe, separatori e spazio bianco.
- Tutto raggiungibile in ≤ 3 click: nuovo elemento (1), completa (1), commento (2), allegato (2), nuovo progetto (2).
- Scorciatoie: `N` nuovo elemento, `Ctrl+K` cerca, `Ctrl+Shift+L` tema, `Esc` chiude il pannello.
- Motion solo in risposta ad azioni (apertura pannello, completamento riga). Rispetta `prefers-reduced-motion`.

---

## 8. Struttura del repository

```
Project goal manager/
  PROGETTO.md                 ← questo documento
  README.md                   avvio, build, distribuzione
  package.json  vite.config.ts  tsconfig.json  index.html
  src/
    main.ts  App.vue  style.css
    router/index.ts
    stores/      workspace.ts  projects.ts  session.ts  ui.ts
    services/    fs.ts  storage.ts  crypto.ts  identity.ts  watcher.ts  config.ts
    types/       index.ts  (schemi zod + tipi)
    components/  ui/ (Button, Dialog, Menu, Select, Input, Toast…)
                 layout/ (TopBar, SideRail, DetailPanel)
                 board/  (ItemRow, ItemComposer, BucketTabs, PriorityPill…)
                 detail/ (Comments, Questions, Attachments)
                 dialogs/ (NewProject, NewWorkspace, Members, Settings…)
    views/       WelcomeView.vue  WorkspaceView.vue  ProjectView.vue  MembersView.vue
  src-tauri/
    Cargo.toml  tauri.conf.json  build.rs
    capabilities/default.json
    src/main.rs  src/lib.rs
    icons/
```

---

## 9. Avvio e distribuzione

```bash
npm install
npm run tauri dev        # sviluppo con hot reload
npm run tauri build      # produce .msi / .exe in src-tauri/target/release/bundle
```
Prerequisiti Windows: Node 20+, Rust (rustup), Microsoft Edge WebView2 (già presente su Windows 10/11).
L'eseguibile si distribuisce copiandolo o tramite installer; i dati restano nella cartella workspace scelta.

---

## 9b. Ruoli, notifiche, cronologia, Google Drive

- **Ruoli**: `admin` (tutto), `cleaner` (come un membro, ma può eliminare definitivamente elementi e progetti dal cestino e svuotare i cestini), `member` (crea, modifica, cestina, ripristina). In un workspace locale si è sempre amministratori.
- **Notifiche**: generate dal confronto fra la versione precedente e quella nuova di un progetto quando un altro utente lo modifica (nuovo elemento, cambio stato, completato/riaperto, cestinato/ripristinato, descrizione, domanda, risposta, commento, menzione). Ogni utente sceglie quali tipi ricevere; le proprie azioni non generano notifiche.
- **Cronologia**: pagina riservata agli amministratori, divisa per progetto, con filtri per progetto, operazione e utente.
- **Google Drive**: l'utente crea un ID client OAuth "App desktop" nella Google Cloud Console; l'app apre il browser di sistema per il consenso (scope `drive.readonly`, PKCE) e riceve il codice su `http://127.0.0.1:<porta>` grazie a un piccolo ricevitore in Rust. La struttura della cartella scelta viene salvata nel workspace (visibile a tutti), mentre token e account restano cifrati sulla macchina: per aprire un documento ciascuno usa il proprio accesso. I documenti Google (Docs, Sheets, Slides) vengono esportati in PDF per l'anteprima.

## 10. Fuori ambito (prima versione) e possibili evoluzioni

- Sincronizzazione cloud, notifiche push, app mobile.
- Evoluzioni: Gantt/timeline delle scadenze, export PDF della roadmap, notifiche desktop sui tag `@utente`, cifratura dell'intero workspace.
