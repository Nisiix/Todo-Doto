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
- assegnare gli elementi alle persone e vedere, da amministratore, il quadro d'insieme nella pagina **Analisi** (progetti, elementi per contenitore/stato/priorità, scadenze, carico per utente e per progetto);
- descrivere per ogni progetto lo **Stack** (tipo di applicazione, linguaggi, framework, repository, cartella sorgente) e una **configurazione guidata** passo per passo (prerequisiti con comando di verifica, passi con comandi/link/operazioni manuali, variabili d'ambiente) che gli altri utenti seguono spuntando i passi fatti o eseguono con uno script Windows generato dall'app;
- elencare gli **Strumenti AI** usati nel progetto (connettori, plugin, skill), con le skill allegate come file e consultabili nell'app;
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
│  │ preferiti     │ │ / Cestino            │ │ commenti,     │ │
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
  tree.json               cartelle/sottocartelle ed etichette (il vecchio campo `categories` viene ignorato)
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
  "schema": 1, "id": "prj_…", "name": "Progetto di test",
  "description": "…", "folderId": "fld_…",
  "members": ["usr_…"],              // vuoto = visibile a tutti i membri del workspace
  "version": 42, "updatedAt": "…", "updatedBy": "usr_…",
  "items": [ {
      "id": "itm_…", "title": "Esportazione dei dati in CSV", "notes": "…",
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
- **Crea**: nome e **due cartelle**: la **cartella dei progetti** (dove si trovano i progetti o dove si vogliono creare; è quella mostrata nei workspace recenti e proposta per i progetti nuovi) e la **cartella Dati Project Goal Manager** (dove l'app salva i propri file: `workspace.json`, progetti, cronologia…), obbligatoria e diversa dalla prima (viene suggerita `<cartella dei progetti> - Project Goal Manager` accanto). Modalità Locale o Rete; in modalità Rete è obbligatoria una password (min 6 caratteri) e la cartella Dati va su una cartella di rete; chi crea diventa admin. La cartella dei progetti è in `workspace.json` (`projectsPath`) e si cambia dalle impostazioni (admin).
- **Workspace recenti**: mostrano la cartella dei progetti (la cartella Dati è nel suggerimento); dal menu "⋯" si toglie un workspace dai recenti oppure, se è locale, si **eliminano i dati di Project Goal Manager**: vengono cancellati solo i file che l'app crea nella cartella Dati, mai la cartella dei progetti. "Apri cartella" sulla cartella dei progetti di un workspace già noto apre quel workspace.
- **Cartella con progetti già esistenti** (`services/projectScan.ts`): se la cartella scelta contiene progetti (sottocartelle con `.git`, `package.json`, `Cargo.toml`, `*.sln`/`*.csproj`, `pyproject.toml`, `go.mod`, `pom.xml`, `composer.json`, `pubspec.yaml`, `README.md`…; esclusi `node_modules`, cartelle nascoste e altri workspace), il dialog li elenca e propone di crearli nel workspace, ciascuno con il nome della sua cartella (selezionabili uno per uno). In questo caso i dati del workspace vanno salvati in **un'altra cartella**, obbligatoria, diversa da quella dei progetti e non dentro uno di essi (viene suggerita `<cartella> - Project Goal Manager` accanto). Per ogni progetto lo Stack si compila dai suoi file: cartella del progetto, repository (da `.git/config`, anche SSH, senza credenziali), linguaggi e framework (dipendenze di `package.json`, `src-tauri`, `.csproj` con WPF/WinForms/ASP.NET, `pyproject`/`requirements`, ecc.), passi base (installazione e avvio con npm/pnpm/yarn, `dotnet build`, `pip install`…), prerequisiti necessari, descrizione e altri dati dal `README.md`, e `ARCHITETTURA.md`/`ARCHITECTURE.md` come documento di architettura. Anche "Apri cartella" su una cartella di progetti che non è un workspace porta a questo dialog invece di dare errore.
- **Apri**: se `mode = network` e l'utente non è ancora in `users.json`, chiede la password; se corretta, l'utente viene aggiunto come `member` e la password viene salvata cifrata in locale (non richiesta ai prossimi avvii). L'admin può **cambiare la password** dalle impostazioni; i membri la reinseriscono al prossimo accesso.

### 5.2 Cartelle, etichette, progetti
- Albero cartelle a profondità libera nella rail sinistra (le categorie delle prime versioni sono state rimosse: le cartelle bastano).
- Etichette: nome e colore, a livello di workspace; si gestiscono dal menu del workspace ("Etichette") o dal link "Gestisci etichette…" nei dialog.
- Progetto: nome, descrizione, cartella, membri. Spostamento nel cestino con conferma implicita (toast "Annulla").
- **Solo gli amministratori** creano progetti e cartelle della barra laterale (e rinominano o eliminano le cartelle): agli altri utenti i pulsanti non compaiono e lo store rifiuta l'operazione.
- **Nuovo progetto dalla sua cartella**: nel dialog prima la cartella, poi il nome (che è quello della cartella). La cartella scelta si analizza (logica distinta dalla cartella dei progetti del workspace, `inspectFolder` in `services/projectScan.ts`): progetto esistente di qualunque tipo o linguaggio (file di progetto noti, strumenti di build, file sorgente in radice o in `src/`…) → "Importa progetto", con lo stack ricavato dai file e la cartella lasciata com'è; cartella vuota o non ancora esistente → progetto da zero con i file iniziali; cartella con altri file → errore (per partire da zero dev'essere vuota); cartella che contiene più progetti, cartella dei progetti del workspace o cartella Dati → errore. Un progetto per cartella: una cartella già usata da un progetto (anche nel cestino) non si può riusare, né alla creazione né nello Stack né importando una cartella di progetti.

### 5.3 Elementi da fare
- Creazione dal dialog "Nuovo task": titolo, descrizione e, nel riquadro "Dettagli", priorità, stato, scadenza, assegnatario ed etichetta, ognuno con nome e una riga di spiegazione; "Gestisci etichette…" non perde quanto inserito.
- Nella riga priorità, stato, scadenza ed etichetta sono badge di larghezza fissa, allineati in colonna, con pallino e testo centrati, solo da vedere: si cambiano selezionando l'elemento, dal dettaglio, con "Salva".
- Ordinamento: immediata → alta → media → bassa, poi scadenza, poi data creazione. Scadenze passate evidenziate.
- Azioni sulla riga: **Completa**, **Cestina**, dettaglio. Nel tab Completati: **Riapri**. Nel tab Cestino: **Ripristina**, **Elimina definitivamente** (conferma), **Svuota cestino**.

### 5.4 Dettaglio elemento (pannello destro)
- Titolo, descrizione e attributi (priorità, stato, scadenza, etichetta, assegnatario) si modificano in locale e si salvano tutti insieme con "Salva" (anche `Ctrl+S`) o si annullano con "Annulla", pulsanti a destra con l'avviso "Modifiche non salvate".
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

1. **Lock, read-modify-write e scritture atomiche.** Ogni azione dell'utente è una *mutazione* `mutateProject(id, fn)`: si prende il lock del file (`<id>.json.lock`, creato in modo esclusivo, con chi lo tiene; i lock abbandonati da un crash si riconoscono e si rimuovono), si rilegge il file dal disco, si applica la modifica, si incrementa `version`, si scrive su un file temporaneo e lo si rinomina sopra l'originale, poi si rilascia il lock. Lo stesso vale per utenti, cartelle/etichette, cronologia e impostazioni del workspace. Così le modifiche di due persone allo stesso file si sommano anche se avvengono nello stesso istante (dettagli in ARCHITETTURA.md, §3.3).
2. **Watcher + polling.** Un watcher sulla cartella del workspace (plugin-fs `watch`) notifica i cambiamenti; dato che su SMB le notifiche possono non arrivare, ogni 4 s si confrontano anche `mtime`/`size` dei file. **Rete aziendale**: il controllo guarda prima solo la data di modifica della cartella del workspace e di `projects/` (ogni scrittura dell'app vi crea e rinomina file: il `.lock` e il temporaneo); se non sono cambiate non si interrogano i singoli file — 2 richieste invece di una per file — e la firma completa si ricalcola comunque ogni 30 s. I file si scrivono in JSON compatto (più piccoli da trasferire; quelli formattati delle versioni precedenti si leggono comunque). Il formato a un file per progetto con scrittura atomica resta: su una cartella condivisa è più sicuro di un database (SQLite e simili non sono affidabili sui lock di rete). Quando un file cambia, lo store ricarica **solo quel file** e la UI si aggiorna grazie alla reattività di Vue.
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
│ Cartelle │ Progetto di test            12 · 4 · 1 │ Export CSV     │
│ ▸ Clienti│ [Da fare] [Completati] [Cestino]       │ priorità alta  │
│   ▸ Web  │ ┃ Export CSV       alta  ● conf  30/11│ scadenza 30/11 │
│          │ ┃ Pagina accesso   imm.  ○ val.       │ ───────────── │
│          │ ┃ Tema scuro       bassa ◐ def.       │ Commenti (2)   │
│          │ + aggiungi…                            │ Domande (1)    │
│ Progetti │                                        │ Allegati (3)   │
│ ○ Demo   │                                        │                │
└──────────┴───────────────────────────────────────┴────────────────┘
```
- Allineamento a sinistra ovunque; niente card nidificate: righe, separatori e spazio bianco.
- Tutto raggiungibile in ≤ 3 click: nuovo elemento (1), completa (1), commento (2), allegato (2), nuovo progetto (2).
- Ricerca **globale** (`Ctrl+K` o `/`): cerca in tutti i progetti visibili (nome del progetto, titolo e descrizione degli elementi, allegati) e mostra i risultati raggruppati per progetto sotto il campo; `↑/↓` e `Invio` aprono l'elemento nel suo progetto.
- Filtri della lista: il pulsante "Filtri" (con il numero di filtri attivi) apre un pannello raggruppato per stato, priorità, scadenza (da/al), persone (**Assegnato a**, **Creato da**) ed etichetta; i filtri attivi restano visibili accanto al pulsante come etichette rimovibili, con "Azzera filtri". L'apertura del pannello è ricordata sul PC.
- Scorciatoie: `N` nuovo task, `Ctrl+K` o `/` ricerca, `↓` dalla pagina alla prima riga e poi `↑/↓` per scorrere, `Invio` apre, `C` completa/riapre, `Canc` cestina, `Ctrl+Invio` crea dal dialog, `Ctrl+S` salva nel dettaglio, `Ctrl+Shift+L` tema, `Esc` chiude, `?` mostra l'elenco (anche dal menu del workspace).
- Verbi dei pulsanti: **Crea** quando si inserisce qualcosa, **Salva** quando si modifica.
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
                 board/  (ItemRow, ItemRowActions, FilterBar, PrioritySelect, StatusSelect, LabelSelect…)
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
npm run tauri build      # produce .msi / .exe in src-tauri/target/release/bundle (app in italiano)
npm run tauri:build:en   # la stessa build con l'app in inglese
npm run tauri:exe:it     # solo l'eseguibile, senza installer (anche tauri:exe:en)
```
L'eseguibile (`src-tauri/target/release/project-goal-manager.exe`) è portabile: si avvia senza installazione, purché sia presente WebView2 (incluso in Windows 10/11).
L'app esiste in **italiano** e in **inglese**: la lingua è decisa in fase di build (`VITE_LOCALE`), quindi ogni installer contiene una sola lingua. Il sito propone l'installer della lingua scelta dal visitatore; la build automatica su GitHub produce entrambe le edizioni (`…_x64_it.msi`, `…_x64_en-setup.exe`, …).
Prerequisiti Windows: Node 20+, Rust (rustup), Microsoft Edge WebView2 (già presente su Windows 10/11).
L'eseguibile si distribuisce copiandolo o tramite installer; i dati restano nella cartella workspace scelta.

---

## 9b. Ruoli, notifiche, cronologia, Google Drive

- **Ruoli**: `admin` (tutto, unico a poter eliminare definitivamente elementi e progetti e a svuotare i cestini), `cleaner` (come un membro, ma può spostare nel cestino qualsiasi elemento), `member` (crea, modifica, ripristina; può cestinare solo gli elementi assegnati a lui o creati da lui se non assegnati). In un workspace di rete un elemento può essere assegnato a qualunque membro. In un workspace locale si è sempre amministratori.
- **Notifiche**: generate dal confronto fra la versione precedente e quella nuova di un progetto quando un altro utente lo modifica (nuovo elemento, cambio stato, completato/riaperto, cestinato/ripristinato, descrizione, domanda, risposta, commento, menzione). Ogni utente sceglie quali tipi ricevere; le proprie azioni non generano notifiche. All'apertura del workspace, le operazioni sugli elementi compiute da altri mentre si era offline vengono recuperate dalla cronologia e proposte come notifiche (una sola volta).
- **Cronologia**: pagina riservata agli amministratori, divisa per progetto, con filtri per progetto, operazione e utente.
- **Google Drive**: l'utente crea un ID client OAuth "App desktop" nella Google Cloud Console; l'app apre il browser di sistema per il consenso (scope `drive.readonly`, PKCE) e riceve il codice su `http://127.0.0.1:<porta>` grazie a un piccolo ricevitore in Rust. La struttura della cartella scelta viene salvata nel workspace (visibile a tutti), mentre token e account restano cifrati sulla macchina: per aprire un documento ciascuno usa il proprio accesso. I documenti Google (Docs, Sheets, Slides) vengono esportati in PDF per l'anteprima.

## 9c. Sezioni del progetto: Todo, Stack, Allegati

Nella barra laterale il progetto aperto mostra sotto di sé un sottomenu con tre sezioni (rotta `p/:id/:section?`; il vecchio indirizzo `…/ai` porta allo Stack). Accanto al nome del progetto, al passaggio del mouse, l'icona del cestino lo sposta nel cestino (solo amministratori, con "Annulla"); nelle sezioni non c'è più un pulsante per farlo. Non c'è più l'ingranaggio delle impostazioni né un dialog di modifica. **Nome**: è quello della cartella del progetto sul disco e si decide alla creazione (il dialog lo dice): scrivendo il nome si propone `<cartella dei progetti>/<nome>`, scegliendo o scrivendo la cartella il nome diventa quello della cartella. Dopo la creazione il nome non si cambia più (nessuna matita nella pagina del progetto). **Visibilità e permessi** (workspace di rete): ogni progetto è **pubblico** (visibile a tutti i membri, anche futuri) o **limitato** (visibile solo agli utenti scelti, oltre agli amministratori), campo `visibility` del progetto; per i file delle versioni precedenti si ricava dagli utenti scelti (presenti = limitato). La visibilità si sceglie alla creazione e si cambia nell'intestazione del progetto (indicatore "Pubblica/Limitata", menu per l'amministratore, con "Scegli gli utenti…"); nella barra laterale un pallino dopo il nome la mostra: verde pubblica, arancione limitata. Gli utenti si assegnano solo ai progetti limitati, dalla pagina Membri con "Gestione permessi" (tabella progetti × utenti, filtro per progetto): i progetti pubblici non compaiono e sono sempre visibili a tutti. Passando a pubblico gli utenti scelti restano memorizzati per un eventuale ritorno a limitato. Descrizione e cartella della barra laterale non si modificano a mano: la descrizione arriva da import e GitHub, la cartella della barra laterale è quella da cui si crea il progetto ("Nuovo progetto qui").

- **Todo**: la lista descritta sopra; contenitori Da fare, Completati, Cestino; pulsante "Nuovo task".
- **Allegati**: cartelle di allegati e anteprima interna (prima erano un contenitore della lista Todo).
- **Stack**: compilato dall'admin (gli altri lo leggono). Campi: tipo di applicazione (web/desktop/mobile/backend), linguaggi, framework, repository, cartella del progetto (locale o di rete, con "Apri cartella"), note, **prerequisiti** (nome, versione, link, comando di verifica), **passi** ordinati (comando con cartella di esecuzione, link o operazione manuale) e **variabili d'ambiente**. La parte "Configura sul tuo PC" mostra la procedura come checklist: ogni utente spunta i passi fatti (progresso salvato in locale), copia i comandi con un click, apre i link.
  - **Verifica automatica dei prerequisiti** (`services/prereqCheck.ts`, `composables/usePrereqChecks.ts`, comando Rust `run_check`): all'apertura dello Stack, quando cambiano i prerequisiti, con "Ricontrolla" e al ritorno sulla finestra (es. dopo un'installazione) l'app esegue il comando di verifica di ogni prerequisito (quello dello stack, altrimenti quello del catalogo; per Visual Studio, Build Tools e Android Studio un controllo dedicato con `vswhere`/file di installazione). I comandi girano senza finestre, con 20 s di tempo massimo, in una cartella neutra e con il PATH riletto dal registro (si vede anche ciò che è stato installato dopo l'avvio dell'app). Esiti: **installato** con la versione (spuntato da solo), **da aggiornare** (versione più vecchia di quella richiesta: `20+`, `>= 3.11`, `3.11 o superiore`, `^18.2`, `~1.4`, `< 3`, `16 - 20`, `20.x`; `stable`/`LTS`/testo = qualsiasi), **non trovato** (comando non riconosciuto, anche in italiano, o alias di Python del Microsoft Store) e, come **incerti**, versione non leggibile, versione diversa da quella indicata, errore, nessuna risposta, verifica solo manuale. Non serve su questo sistema (es. Xcode su Windows) conta come fatto. Se il comando non si trova, su Windows si prova una seconda verifica: il percorso d'installazione standard (es. `%ProgramFiles%\dotnet\dotnet.exe`, `nodejs`, `Git`, `.cargo`, Docker) o il launcher `py` di Python; se così lo trova lo dice ("non è nel PATH"). .NET: con il solo runtime ("No .NET SDKs were found") il .NET SDK risulta mancante, con la nota che il .NET Framework di Windows e i runtime non bastano. I comandi personalizzati scritti nello stack partono da soli solo se sono semplici richieste di versione (`node -v`, `git --version`…): gli altri restano fermi finché l'utente non li conferma ("Esegui verifica"). Nell'anteprima nel browser la verifica non è disponibile.
  - **Blocco della configurazione automatica**: finché un prerequisito manca o è da aggiornare, o ha un esito incerto non confermato a mano (spuntando il cerchio, "Confermo che è installato e va bene"), "Avvia configurazione" e "Salva lo script…" sono disattivati e il dialog elenca i prerequisiti da sistemare; la conferma a mano non sblocca quelli mancanti o da aggiornare.
  - **Configurazione automatica**: "Gestisci configurazione automatica" mostra un riepilogo (cartella in cui si eseguono i comandi, verifiche dei prerequisiti, passi) e "Avvia configurazione" scrive lo script `setup-<slug>.cmd` nella cartella dati dell'app e lo apre: Windows lo esegue in una finestra del prompt dei comandi, che si posiziona nella cartella del progetto (creandola se manca), verifica i prerequisiti ed esegue i passi uno dopo l'altro, fermandosi al primo errore e sui passi manuali. "Salva lo script…" lo salva dove si vuole. Nel browser (anteprima) l'avvio non è disponibile.
  - **Solo preparazione del PC**: la configurazione generata in automatico (riconoscimento dei progetti, import `.md`) contiene i prerequisiti (linguaggi, framework, strumenti) e i passi per preparare l'ambiente (clonare, installare le dipendenze…), non quelli sull'uso del programma (avvio, build, test, deploy); si ferma al passo che apre l'editor, aggiunto in fondo se manca ("Apri il progetto nell'editor", o la soluzione Visual Studio per i progetti .NET).
  - **Salvataggio**: in modifica una barra fissa in fondo alla pagina mostra se ci sono modifiche non salvate, con "Salva" (anche `Ctrl+S`) e "Annulla".
  - **Prerequisiti automatici** (`services/prerequisites.ts`): scrivendo il nome di uno strumento noto (Node.js, Git, Rust, .NET SDK, Python, Java, Docker, PostgreSQL…, anche con alias come `node` o `dotnet`) si completano versione, link e comando di verifica, solo nei campi vuoti; quando si aggiungono linguaggi, framework o un repository git vengono aggiunti da soli i prerequisiti che richiedono (TypeScript/Vue → Node.js, Rust/Tauri → Rust e Build Tools, C# → .NET SDK, repository → Git…). Uno tolto a mano non viene riaggiunto, ma resta tra i "suggeriti" da aggiungere con un clic.
  - **Import di un documento di architettura** (`services/stackDoc.ts`): "Importa .md" legge un Markdown (README, ARCHITETTURA.md…) e ne ricava tipo di applicazione, linguaggi, framework, repository, note, prerequisiti (da elenchi e tabelle), passi (elenchi numerati con i blocchi di codice, `cd` iniziale come cartella) e variabili d'ambiente (tabelle, blocchi `.env`). Riconosce le sezioni dal titolo in italiano e in inglese e le righe "Linguaggi: …"; altrimenti cerca nel testo i nomi noti. Quanto trovato si aggiunge allo stack in modifica senza cancellare nulla e il documento resta memorizzato (`stack.doc`), consultabile e copiato nella cartella del progetto. Il README generato dall'app si reimporta senza perdite.
- **Strumenti AI**: in fondo alla pagina Stack.- **Stack come modello**: lo stack di un progetto si copia in un altro. Alla creazione di un progetto l'admin sceglie "Stack e configurazione iniziale → Copia da «…»", oppure, nella sezione Stack, usa "Importa stack da altro progetto": sceglie un progetto esistente e la pagina passa in modifica con stack e configurazione importati, da controllare e salvare. Finché lo stack è vuoto il pulsante di modifica si chiama "Aggiungi stack tecnologico". Nella copia il nome del progetto di origine (anche nella forma `slug`, es. `progetto-di-test`) diventa quello nuovo in comandi, link, note e file; la cartella locale non viene copiata. Lo stack può contenere **file iniziali** (percorso relativo + contenuto, es. `package.json`, `.gitignore`) con i segnaposto `{{name}}` e `{{slug}}`, che valgono anche nei passi.
- **Cartella del progetto sul disco**: si indica alla creazione del progetto (ne dà il nome) o nella sezione Stack. La **cartella dei progetti** del workspace (Impostazioni) si salva dalla 0.2.4: per i workspace creati prima l'app la ricava all'apertura dalla cartella madre più frequente delle cartelle dei progetti e, per l'amministratore, la memorizza (per un progetto nuovo è proposta `<cartella dei progetti>/<nome>`) e corrisponde a "Cartella del progetto" dello Stack.
- **GitHub** (`services/github.ts`, `stores/github.ts`, pagina "GitHub" accanto a Drive): ci si collega con un token personale fine-grained in sola lettura (Metadata + Contents), salvato cifrato solo sul PC. Dall'elenco dei repository l'admin crea i progetti (nome = repository; se esiste un progetto con lo stesso nome viene collegato quello) e lo Stack si ricava dai file del repository (README, `package.json`, `Cargo.toml`, `*.csproj`…, linguaggi di GitHub; primo passo `git clone`), unendosi a quello esistente senza cancellare nulla. I progetti collegati si risincronizzano da "Sincronizza"/"Sincronizza tutti" e, se attivo, in automatico all'apertura del workspace (al massimo una volta all'ora). Nello Stack una riga mostra il repository collegato e quando è stato sincronizzato; se il repository indicato è su github.com ma non collegato, "Collega a GitHub".
- **Cartella del progetto creata con il progetto**: se la cartella indicata alla creazione non esiste, viene creata subito con `README.md` (stack, prerequisiti, passi, variabili), `.env.example`, lo script `setup-<slug>.cmd` e i file iniziali dello stack (che hanno la precedenza a parità di percorso; percorsi assoluti o con `..` sono ignorati); una cartella esistente si usa così com'è. Nello Stack non c'è più un pulsante per crearla.
- **Stack dai file del progetto**: lo stack si ricava dai file della cartella del progetto (anche di rete): radice e, se lì non c'è un progetto riconoscibile, le sottocartelle fino a due livelli (es. `src\App\App.csproj`, `frontend\package.json`, `backend\pom.xml`; esclusi `node_modules`, `bin`, `obj`, `dist`…), con i passi eseguiti nella sottocartella giusta. Una cartella che non si legge non diventa più uno stack vuoto in silenzio: l'errore viene spiegato. Nello Stack, "Rileva dai file del progetto" (admin) rilegge la cartella e aggiunge quanto trovato senza cancellare nulla; se lo stack non ha ancora tecnologie lo propone un riquadro.
- **Cartelle di rete** (`services/fsErrors.ts`): ogni cartella scelta o scritta (cartella dei progetti, cartella Dati, cartella del progetto, "Apri cartella") viene verificata prima dell'uso: radice raggiungibile (`\\server\condivisione` o unità `Z:`), cartella leggibile e, dove serve, scrivibile (file di prova creato e tolto). Gli errori del sistema diventano spiegazioni: server non raggiungibile (53), condivisione inesistente (67), accesso negato (5), credenziali non valide (1326/86), credenziali in conflitto (1219), accesso guest bloccato (1272), connessione interrotta (64), timeout (121), unità mappata scollegata o non visibile all'app avviata come amministratore (3/15/21), file in uso (32/33)…, con il codice tra parentesi; valgono anche per i salvataggi e l'apertura del workspace. La radice di ogni percorso usato viene inoltre consentita esplicitamente al plugin fs (comando Rust `allow_paths`), così i percorsi di rete funzionano anche riaperti dopo un riavvio.
- **Strumenti AI** (nella pagina Stack): connettori, plugin e skill del progetto; per le skill si allega il file (es. `SKILL.md`, fino a 512 KB) o si incolla il contenuto, che resta nel file del progetto e si può vedere, copiare o salvare.

Dati nel file del progetto: `stack` (con `files` per i file iniziali e `doc` per il documento di architettura) e `aiTools` (vedi schemi in `types/index.ts`); gli elementi hanno `assigneeId`.

## 10. Fuori ambito (prima versione) e possibili evoluzioni

- Sincronizzazione cloud, notifiche push, app mobile.
- Evoluzioni: Gantt/timeline delle scadenze, export PDF della roadmap, notifiche desktop sui tag `@utente`, cifratura dell'intero workspace.
