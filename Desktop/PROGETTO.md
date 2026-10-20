# Todo Doto — documento di progetto

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
| Sicurezza | **Web Crypto API** (PBKDF2-SHA256, AES-GCM) + **Windows DPAPI** | Hash della password del workspace; la password ricordata (solo se l'utente lo sceglie) è cifrata con DPAPI per l'account Windows corrente, con ripiego AES-GCM sugli altri sistemi. |

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

### readiness/<idUtente>.json — configurazione del PC (solo workspace di rete)
```jsonc
{ "userId": "usr_…", "host": "PC-UFFICIO", "os": "windows", "updatedAt": "…",
  "projects": { "prj_…": { "checkedAt": "…", "hash": "impronta dei prerequisiti",
                           "missing": [ { "name": "Node.js", "status": "missing", "found": "", "required": "20+" } ],
                           "ok": 2, "uncertain": 0 } } }
```
Ogni PC scrive solo il file del proprio utente (niente conflitti). Si condividono esito e versione trovata, mai l'output dei comandi.

### presence/<idUtente>.json — chi lavora a cosa (solo workspace di rete)
```jsonc
{ "userId": "usr_…", "projectId": "prj_…", "itemId": "itm_…", "since": "…", "beat": "…" }
```
Un file per utente, scritto solo da lui: «Ci sto lavorando» su un task (uno per volta; `itemId: null` = nessuno). Si rinnova ogni 10 minuti; oltre 30 minuti senza rinnovo (PC spento, app chiusa male) l'indicazione non si mostra più. Si toglie da sola completando o cestinando il task e chiudendo l'app.

### audit/<AAAA-MM>.<scrittore>.json — cronologia per mese e per PC (dalla 0.4.0)
Ogni PC scrive solo i propri file (`<idUtente>-<PC>`), uno al mese, con lo stesso formato di `audit.json`; all'apertura si leggono gli ultimi 6 mesi più il vecchio `audit.json` (scritto dalle versioni precedenti, che resta leggibile). I file propri più vecchi di un anno si tolgono da soli.

### changes/<scrittore>.json — giornale delle modifiche (dalla 0.4.0)
```jsonc
{ "writer": "usr_…-PC-UFFICIO", "seq": 1842, "entries": [ { "seq": 1841, "key": "projects/prj_…" }, { "seq": 1842, "key": "audit/2026-10.usr_…-PC-UFFICIO" } ] }
```
Ogni scrittura aggiunge il file toccato (ultime 300 righe). Gli altri PC leggono solo i giornali cambiati e interrogano solo quei file; se un giornale non spiega un cambiamento (versione precedente dell'app, giornale troppo indietro) si rilegge la cartella.

### projects/<id>.c<n>.json — capitoli dei progetti grandi (dalla 0.4.0)
Da 300 task in su i task stanno in capitoli di circa 150 (il capitolo dipende dall'id del task); il file principale ha `items: { "chunks": n, "order": [id…] }`, un oggetto e non un elenco, così le versioni precedenti non lo leggono (e non possono riscriverlo perdendo i task). Sotto le 100 attività si torna a un file solo. Una modifica riscrive solo il capitolo toccato e il file principale.

### mail/<tipo>-<data>.json — invii giornalieri
Segnaposto creato in modo esclusivo dal PC che invia il punto della giornata: uno al giorno, tolti dopo 30 giorni.

### Cifratura sul disco (facoltativa, workspace di rete)
Con la cifratura attiva tutti i file della cartella Dati tranne `workspace.json` (utenti, cartelle, cronologia, Drive, progetti, configurazione dei PC, presenza, copie di sicurezza) sono cifrati con AES-GCM 256: testo `PGMENC1:` + base64(iv + dati). La **chiave dati** è casuale e sta in `workspace.json` avvolta con una chiave ricavata dalla password del workspace (PBKDF2-SHA256, campo `encryption`: `{ v, enabled, salt, iterations, wrapped }`). Cambiare la password riavvolge solo la chiave; attivare o disattivare la cifratura riscrive i file, che nel frattempo si leggono in entrambi i formati.

### backups/*.pgmbackup — copie di sicurezza
JSON compresso (gzip) con workspace, utenti, cartelle ed etichette, Drive, cronologia e tutti i progetti. Nome `pgm-AAAAMMGG-hhmmss-<auto|manual|prerestore>.pgmbackup`; cartella predefinita `backups` nella cartella Dati, oppure quella scelta dall'admin. Mai i file dei progetti né le password ricordate.

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
config.json        tema, workspace recenti, preferiti per workspace, notifiche disattivate, IA locale (motore, indirizzo, modelli, banner chiuso)
credentials.json   password dei workspace di rete ricordate su scelta dell'utente, cifrate con Windows DPAPI per l'account corrente (prefisso `dpapi:`; altrove AES-GCM)
drive-auth.json    ID client Google e token OAuth (solo lettura), cifrati con AES-GCM
offline/<idWorkspace>.json   copia di un workspace di rete per il lavoro fuori ufficio (se attiva su questo PC): workspace.json in chiaro + dati cifrati con la chiave dati del workspace, o con DPAPI se il workspace non è cifrato; progetti modificati offline con la loro «base» e voci di cronologia da inviare
```
Le notifiche ricevute restano in localStorage, per workspace e utente.

---

## 5. Funzionalità e flussi

### 5.1 Workspace
- **Schermata iniziale**: elenco workspace recenti + "Crea workspace" + "Apri workspace".
- **Crea**: nome e **due cartelle**: la **cartella dei progetti** (dove si trovano i progetti o dove si vogliono creare; è quella mostrata nei workspace recenti e proposta per i progetti nuovi) e la **cartella Dati Todo Doto** (dove l'app salva i propri file: `workspace.json`, progetti, cronologia…), obbligatoria e diversa dalla prima (viene suggerita `<cartella dei progetti> - Todo Doto` accanto). Modalità Locale o Rete; in modalità Rete è obbligatoria una password (min 6 caratteri) e la cartella Dati va su una cartella di rete; chi crea diventa admin. La cartella dei progetti è in `workspace.json` (`projectsPath`) e si cambia dalle impostazioni (admin).
- **Workspace recenti**: mostrano la cartella dei progetti (la cartella Dati è nel suggerimento); dal menu "⋯" si toglie un workspace dai recenti oppure, se è locale, si **eliminano i dati di Todo Doto**: vengono cancellati solo i file che l'app crea nella cartella Dati, mai la cartella dei progetti. "Apri cartella" sulla cartella dei progetti di un workspace già noto apre quel workspace.
- **Cartella con progetti già esistenti** (`services/projectScan.ts`): se la cartella scelta contiene progetti (sottocartelle con `.git`, `package.json`, `Cargo.toml`, `*.sln`/`*.csproj`, `pyproject.toml`, `go.mod`, `pom.xml`, `composer.json`, `pubspec.yaml`, `README.md`…; esclusi `node_modules`, cartelle nascoste e altri workspace), il dialog li elenca e propone di crearli nel workspace, ciascuno con il nome della sua cartella (selezionabili uno per uno). In questo caso i dati del workspace vanno salvati in **un'altra cartella**, obbligatoria, diversa da quella dei progetti e non dentro uno di essi (viene suggerita `<cartella> - Todo Doto` accanto). Per ogni progetto lo Stack si compila dai suoi file: cartella del progetto, repository (da `.git/config`, anche SSH, senza credenziali), linguaggi e framework (dipendenze di `package.json`, `src-tauri`, `.csproj` con WPF/WinForms/ASP.NET, `pyproject`/`requirements`, ecc.), passi base (installazione e avvio con npm/pnpm/yarn, `dotnet build`, `pip install`…), prerequisiti necessari, descrizione e altri dati dal `README.md`, e `ARCHITETTURA.md`/`ARCHITECTURE.md` come documento di architettura. Anche "Apri cartella" su una cartella di progetti che non è un workspace porta a questo dialog invece di dare errore.
- **Apri**: se `mode = network` chiede la password (a meno che non sia ricordata e ancora valida); al primo accesso l'utente viene aggiunto come `member`. Sotto la password c'è **"Ricorda la password su questo PC"** (non spuntata di default, come nella creazione del workspace): se scelta, la password viene salvata cifrata con **Windows DPAPI** per l'account Windows corrente, quindi illeggibile da altri utenti del PC o copiando il file su un'altra macchina, e i prossimi accessi non la chiedono; se non scelta, non resta nulla sul PC e viene chiesta a ogni apertura.
- **Impostazioni** (dal menu del workspace in alto a sinistra; finestra a schede di dimensione fissa: **Generali** con aspetto, cartella dei progetti, cartella Dati e riapertura dell'ultimo workspace; **Dati utente** con nome visibile, nome del workspace e password; **Notifiche**; **Backup**, solo amministratori). **Dati utente → Password del workspace**: mostra se la password è ricordata su questo PC, con "Dimentica su questo PC". L'**admin** può **cambiare la password** del workspace: vale per tutti, gli altri utenti la reinseriscono al prossimo accesso; la sua copia ricordata (se c'è) si aggiorna. Solo gli admin possono farlo, anche a livello di store.

### Cancellazioni: cosa tocca l'app sul disco
- Spostare un progetto nel cestino, ripristinarlo, eliminarlo definitivamente, svuotare il cestino o eliminare una cartella del workspace agisce **solo sul workspace**: l'unico file che sparisce è `projects/<id>.json` nella cartella Dati. **La cartella del progetto e i suoi file non vengono mai toccati**, e ogni messaggio di conferma, toast e banner lo dice.
- Le cartelle della barra laterale sono solo organizzazione: eliminarle non tocca nessuna cartella sul disco.
- "Elimina i dati di Todo Doto" (workspace locali) cancella solo i file dell'app nella cartella Dati; in `projects/` solo i file che sono davvero progetti (nome `<id>.json` con lo stesso id dentro). Tutto il resto resta.
- Salvaguardie nel codice: `remove` non è mai ricorsiva (una cartella con contenuto non si elimina), gli id dei progetti sono validati (niente `..` o separatori) e la password esiste solo nei workspace di rete.

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

**Controllo adattivo** (dalla 0.4.0): ogni 4 s con la finestra davanti, 30 s in secondo piano, 60 s dopo 5 minuti senza tastiera né mouse, 2 minuti con la finestra ridotta a icona; tornando sulla finestra si controlla subito. Con molti PC aperti il carico sul file server scende di diverse volte.

La firma è divisa **per cartella** (radice, `projects/`, `readiness/`, `presence/`, `audit/`); con i giornali delle modifiche (`changes/`) di una cartella cambiata si interrogano solo i file indicati: si rileggono le date dei file solo nelle cartelle cambiate, così il rinnovo della presenza di un collega non fa interrogare tutti i progetti. Se la cartella del workspace non risponde la firma fallisce (non vale come «file cancellati»).

Errori di rete (percorso non raggiungibile) → con la copia fuori ufficio attiva (predefinito) si continua a lavorare sulla copia di questo PC (vedi §9f), altrimenti banner "Cartella non raggiungibile, riprovo…" con retry automatico; l'app non si blocca.

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
Todo-Doto/
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
L'eseguibile (`src-tauri/target/release/todo-doto.exe`) è portabile: si avvia senza installazione, purché sia presente WebView2 (incluso in Windows 10/11).
L'app esiste in **italiano** e in **inglese**: la lingua è decisa in fase di build (`VITE_LOCALE`), quindi ogni installer contiene una sola lingua. Il sito propone l'installer della lingua scelta dal visitatore; la build automatica su GitHub produce entrambe le edizioni (`…_x64_it.msi`, `…_x64_en-setup.exe`, …).
Prerequisiti Windows: Node 20+, Rust (rustup), Microsoft Edge WebView2 (già presente su Windows 10/11).
L'eseguibile si distribuisce copiandolo o tramite installer; i dati restano nella cartella workspace scelta.

---

## 9b. Ruoli, notifiche, cronologia, Google Drive

- **Ruoli**: `admin` (tutto, unico a poter eliminare definitivamente elementi e progetti e a svuotare i cestini), `cleaner` (come un membro, ma può spostare nel cestino qualsiasi elemento), `member` (crea, modifica, ripristina; può cestinare solo gli elementi assegnati a lui o creati da lui se non assegnati). In un workspace di rete un elemento può essere assegnato a qualunque membro. In un workspace locale si è sempre amministratori.
- **Notifiche**: generate dal confronto fra la versione precedente e quella nuova di un progetto quando un altro utente lo modifica (nuovo elemento, cambio stato, completato/riaperto, cestinato/ripristinato, descrizione, domanda, risposta, commento, menzione). Ogni utente sceglie quali tipi ricevere; le proprie azioni non generano notifiche. All'apertura del workspace, le operazioni sugli elementi compiute da altri mentre si era offline vengono recuperate dalla cronologia e proposte come notifiche (una sola volta).
- **Gestione delle notifiche**: alla chiusura del pannello le notifiche viste diventano lette e non tornano mai "nuove"; "Segna tutte come lette", la X su ogni notifica ed "Elimina tutte". Ogni notizia ha una chiave: una notizia già ricevuta (letta, non letta o eliminata) non viene ricreata.
- **Configurazione del PC** (Stack): all'apertura del workspace, e tornando sulla finestra dopo 30 minuti, l'app verifica in background i prerequisiti di tutti i progetti visibili, eseguendo solo i comandi sicuri (richieste di versione; quelli personalizzati restano da confermare nello Stack).
  - Se al PC manca qualcosa per un progetto arriva una **notifica locale** "Configurazione incompleta su questo PC: …", una sola volta per la stessa mancanza; se la mancanza viene risolta e poi si ripresenta, si avvisa di nuovo. Il tipo si può disattivare in Impostazioni → Notifiche.
  - Nei workspace di rete l'esito viene condiviso e nello Stack compare un **banner rosso** quando almeno un utente che vede il progetto ha una configurazione incompleta, con **"Visualizza"** per l'elenco dei soli utenti a cui manca qualcosa (cosa manca, PC, quando è stato verificato). Gli esiti di prerequisiti cambiati dopo la verifica, o più vecchi di 30 giorni, non contano.
- **Copie di sicurezza** (Impostazioni → scheda Backup, amministratori): copia automatica ogni giorno, attiva di default, fatta dal primo PC che apre il workspace (un lock evita i doppioni). Si tengono 7 copie giornaliere + 4 settimanali, più le ultime 10 manuali e 5 "prima di un ripristino". Si possono creare copie manuali ("Crea copia ora") e scegliere la cartella (meglio un altro disco o server).
  - **Ripristina…**: di tutto il workspace, oppure di un solo progetto (es. dopo un'eliminazione definitiva). Prima del ripristino viene sempre creata una copia dello stato attuale, quindi anche il ripristino si può annullare. Password e impostazioni delle copie non tornano indietro.
  - Il menu del workspace mostra all'admin "Ultima copia dei dati: …", che diventa un avviso se l'ultima ha più di 3 giorni o è fallita. La rotazione elimina solo file con il nome delle copie dell'app.
- **Cronologia**: pagina riservata agli amministratori, divisa per progetto, con filtri per progetto, operazione e utente.
- **Google Drive**: l'utente crea un ID client OAuth "App desktop" nella Google Cloud Console; l'app apre il browser di sistema per il consenso (scope `drive.readonly`, PKCE) e riceve il codice su `http://127.0.0.1:<porta>` grazie a un piccolo ricevitore in Rust. La struttura della cartella scelta viene salvata nel workspace (visibile a tutti), mentre token e account restano cifrati sulla macchina: per aprire un documento ciascuno usa il proprio accesso. I documenti Google (Docs, Sheets, Slides) vengono esportati in PDF per l'anteprima. **Nei workspace di rete**: il client OAuth lo imposta un amministratore per tutto il workspace (`oauthClientId`/`oauthClientSecret` in `drive.json`; per le app desktop Google non considera il segreto confidenziale; un client configurato solo sul PC di un amministratore, con le versioni precedenti, si condivide da solo), così gli altri membri devono solo collegare il proprio account Google. L'account resta di ciascuno: l'accesso ai documenti dipende dai permessi del proprio account su Drive, e condividere il token di un altro gli darebbe il Drive di quella persona. Scelta e rimozione della cartella replicata sono solo degli amministratori. **Risincronizzare lo può fare chiunque, e vale per sé**: ognuno vede i file a cui il proprio account ha accesso. La struttura sincronizzata da un amministratore è quella del workspace (la vedono tutti, anche chi non ha collegato l'account); quella di un altro utente resta sul suo PC (`<dati app>/drive/<id workspace>.json`) e per lui prende il posto di quella condivisa, senza cambiare cosa vedono gli altri.

## 9c. Sezioni del progetto: Stack, Todo, Gantt, Allegati

Nella barra laterale il progetto aperto mostra sotto di sé un sottomenu con le sezioni, nell'ordine Stack, Todo, Gantt, Allegati (rotta `p/:id/:section?`; il vecchio indirizzo `…/ai` porta allo Stack). Accanto al nome del progetto, al passaggio del mouse, l'icona del cestino lo sposta nel cestino (solo amministratori, con "Annulla"); nelle sezioni non c'è più un pulsante per farlo. Non c'è più l'ingranaggio delle impostazioni né un dialog di modifica. **Nome**: è quello della cartella del progetto sul disco e si decide alla creazione (il dialog lo dice): scrivendo il nome si propone `<cartella dei progetti>/<nome>`, scegliendo o scrivendo la cartella il nome diventa quello della cartella. Dopo la creazione il nome non si cambia più (nessuna matita nella pagina del progetto). **Visibilità e permessi** (workspace di rete): ogni progetto è **pubblico** (visibile a tutti i membri, anche futuri) o **limitato** (visibile solo agli utenti scelti, oltre agli amministratori), campo `visibility` del progetto; per i file delle versioni precedenti si ricava dagli utenti scelti (presenti = limitato). La visibilità si sceglie alla creazione e si cambia nell'intestazione del progetto (indicatore "Pubblica/Limitata", menu per l'amministratore, con "Scegli gli utenti…"); nella barra laterale un pallino dopo il nome la mostra: verde pubblica, arancione limitata. Gli utenti si assegnano solo ai progetti limitati, dalla pagina Membri con "Gestione permessi" (tabella progetti × utenti, filtro per progetto): i progetti pubblici non compaiono e sono sempre visibili a tutti. Passando a pubblico gli utenti scelti restano memorizzati per un eventuale ritorno a limitato. Descrizione e cartella della barra laterale non si modificano a mano: la descrizione arriva da import e GitHub, la cartella della barra laterale è quella da cui si crea il progetto ("Nuovo progetto qui").

- **Todo**: la lista descritta sopra; contenitori Da fare, Completati, Cestino; pulsante "Nuovo task".
- **Cartella del progetto su questo PC** (`services/projectFolder.ts`): nello Stack "Configura sul tuo PC" compare solo se la cartella del progetto è valida su questo PC: esiste, contiene un progetto riconoscibile (o il README generato dall'app per un progetto appena creato) e si chiama come il progetto nell'applicazione. Altrimenti un riquadro spiega il motivo (mancante, non raggiungibile, senza progetto, nome diverso) e permette di **cercarla**: la cartella scelta, se valida, si ricorda per questo PC (la stessa cartella può avere percorsi diversi sui vari PC); l'amministratore può renderla quella del progetto per tutti. Un progetto da clonare (primo passo `git clone`) non ha ancora la cartella: la configurazione resta disponibile perché è lei a crearla.
- **Condivisione solo in rete** (`services/sharing.ts`, `path_is_remote` nel backend): un workspace "Condiviso in rete" si crea solo se la cartella Dati e la cartella dei progetti sono su un'unità di rete (`\\server\…` o una lettera collegata a una condivisione, es. `Z:`); altrimenti il dialog spiega che non si può condividere perché è in locale. Nei workspace di rete la visibilità di un progetto ad altri membri (pubblica/limitata, utenti scelti) si assegna solo se la cartella Dati e la cartella del progetto sono in rete: per un progetto in locale il dialog di creazione lo dice (e lo crea visibile solo agli amministratori), l'intestazione mostra "In locale" invece del menu della visibilità, "Gestione permessi" non permette di scegliere utenti e la pagina Membri avvisa se è il workspace a essere in locale.
- **Controlli in modifica dello stack** (`services/stackValidation.ts`): mentre si modifica, ogni campo sbagliato è segnato in rosso con il motivo e lo stack **non si salva** (pulsante Salva disattivato, anche Ctrl+S) finché non è corretto. Cartella del progetto: se cambiata dev'essere valida come sopra (o mancante ma col nome del progetto, se un passo la clona) e non di un altro progetto; quella già salvata ma non valida su questo PC non blocca (può essere il percorso di un altro PC) e viene solo segnalata. Repository: URL https/ssh/git/file, `git@server:percorso` o cartella locale/di rete. Link di download dei prerequisiti e passi di tipo link: pagine web (anche senza `https://`). Cartella di esecuzione dei passi: senza caratteri vietati da Windows. Variabili d'ambiente: nomi validi (`API_URL`) e non ripetuti. File iniziali: percorsi relativi dentro la cartella del progetto, senza `..`, e non ripetuti. I segnaposto `{{name}}`/`{{slug}}` si controllano già sostituiti; le righe vuote si scartano come prima.
- **Gantt** (`services/gantt.ts`, `components/board/GanttChart.vue`): solo i task con stato **Confermato** e una scadenza (i completati a richiesta, mai quelli nel cestino). La barra va da quando il task è diventato Confermato (`confirmedAt`; per i task di prima, dalla creazione) alla scadenza; se la scadenza è precedente è una tappa. Raggruppato per **etichetta** (nell'ordine delle etichette, "Senza etichetta" in fondo) o per **priorità**; dentro ogni gruppo per priorità e scadenza. Barre del colore della priorità, contorno rosso se scaduto, linea di oggi, fine settimana in grigio; scala Giorni/Settimane; un clic apre il task. La **scadenza** si indica solo con stato Confermato: altrimenti il campo è disattivato e, lasciando Confermato, la scadenza si toglie (regola applicata anche nello store a ogni salvataggio che tocca stato o scadenza).
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
- **GitHub** (`services/github.ts`, `stores/github.ts`, pagina "GitHub" accanto a Drive): ci si collega con un token personale fine-grained in sola lettura (Metadata + Contents), salvato cifrato solo sul PC. Dall'elenco dei repository l'admin crea i progetti (nome = repository; se esiste un progetto con lo stesso nome viene collegato quello) e lo Stack si ricava dai file del repository (README, `package.json`, `Cargo.toml`, `*.csproj`…, linguaggi di GitHub; primo passo `git clone`), unendosi a quello esistente senza cancellare nulla. I progetti collegati si risincronizzano da "Sincronizza"/"Sincronizza tutti" e, se attivo, in automatico all'apertura del workspace (al massimo una volta all'ora). Nello Stack una riga mostra il repository collegato e quando è stato sincronizzato; se il repository indicato è su github.com ma non collegato, "Collega a GitHub". **Nei workspace di rete** il token lo imposta solo un amministratore: per cleaner e membri il pulsante "GitHub" non c'è e la pagina dice che il collegamento lo gestisce un amministratore (lo store rifiuta comunque il token). Gli Stack sincronizzati sono nel workspace, quindi li vedono tutti senza collegarsi.
- **Cartella del progetto creata con il progetto**: se la cartella indicata alla creazione non esiste, viene creata subito con `README.md` (stack, prerequisiti, passi, variabili), `.env.example`, lo script `setup-<slug>.cmd` e i file iniziali dello stack (che hanno la precedenza a parità di percorso; percorsi assoluti o con `..` sono ignorati); una cartella esistente si usa così com'è. Nello Stack non c'è più un pulsante per crearla.
- **Riconoscimento preciso** (`services/manifests.ts`): i prerequisiti si ricavano da ciò che i file di progetto *dichiarano*, non dal linguaggio. Visual Studio: la soluzione `.sln` dice con quale versione ed edizione è stata creata (es. "Visual Basic Express 2010", `VisualStudioVersion = 17` = 2022) e quali progetti contiene (anche nelle sottocartelle); i progetti "SDK" (`net8.0`…) richiedono il .NET SDK della versione dichiarata (o di `global.json`), quelli classici .NET Framework (`ToolsVersion`, `TargetFrameworkVersion v4.0`) richiedono Visual Studio di quella generazione o successivo e il .NET Framework, **non** il .NET SDK; il linguaggio viene dal tipo di file (`.vbproj` → VB.NET), Windows Forms/WPF/web dalle dichiarazioni; C++ dal set di strumenti (`v143` = 2022). Visual Basic 6 (`.vbp`). Desktop: Delphi (`.dproj`, VCL/FireMonkey, ProjectVersion), Lazarus, C/C++ con CMake (versione minima) e Qt 5/6, qmake, Python con PyQt/PySide/wxPython/Kivy/Tkinter, Java con JavaFX o Compose Desktop, Go con Fyne (compilatore C) o Wails, Flutter per Windows (Visual Studio con il C++), Electron, Tauri (WebView2), Microsoft Access, Visual FoxPro, PowerBuilder. Versioni dichiarate negli altri ecosistemi: `engines.node`, `.nvmrc`, `packageManager` (pnpm/Yarn), `requires-python`/`.python-version`, `go.mod`, versione Java del `pom.xml`, `rust-version`, PHP di `composer.json`, `.ruby-version`, Flutter di `pubspec.yaml`. Verifiche: Visual Studio anche nelle versioni precedenti al 2017 ed Express (dal registro, "10.0" = 2010), .NET Framework, WebView2, Access, Delphi dal registro. "Rileva dai file del progetto" **corregge** anche lo stack già salvato: aggiorna le versioni dichiarate diversamente e toglie i prerequisiti che i file escludono (es. .NET SDK per un progetto .NET Framework).
- **Prerequisiti senza i file** (`services/prerequisites.ts`): con solo .NET Framework o Visual Basic 6 (senza .NET moderno: `.NET`, ASP.NET Core, Blazor, MAUI) il .NET SDK non si propone, nemmeno con C# o VB.NET; Visual Studio non ha più "2022" come versione predefinita (la versione la dichiara la soluzione). Gli stack salvati prima del riconoscimento preciso si **rivedono anche senza la cartella**: il riquadro "Prerequisiti da rivedere" propone di togliere il .NET SDK e di sostituire Visual Studio "2022" con la versione minima per il .NET Framework dichiarato (4.0 → 2010+), o con nessuna versione; "Correggi" (amministratori) con "Annulla". Con la cartella valida su questo PC, all'apertura dello Stack i prerequisiti si confrontano da soli con i file e si correggono (una volta per sessione, con "Annulla").
- **Prerequisiti mancanti e verifiche**: il .NET Framework si propone anche dalle regole (linguaggi/framework), non solo dai file: un progetto .NET Framework senza cartella leggibile (es. ApriProgettoVB6) lo richiede. Git si richiede anche quando un passo usa git (es. `git clone`). Il riquadro "Prerequisiti da rivedere" propone anche i prerequisiti deducibili che mancano ("da aggiungere", con il motivo) e ha "Ignora" (per progetto, su questo PC). Verifiche aggiunte: Visual FoxPro 9 e PowerBuilder (registro/percorso d'installazione, prima solo conferma a mano); Java (`JAVA_HOME`), Go e CMake anche se non sono nel PATH.
- **Apertura nell'editor**: il passo "Apri … nell'editor" non fa parte della configurazione: niente spunta, non conta nell'avanzamento, non va nello script; è l'operazione conclusiva, con un pulsante che apre il file di progetto indicato (es. `.sln` in Visual Studio, `.vbp` in Visual Basic 6.0) con il programma associato, Visual Studio Code (`code`) per il passo generico, altrimenti la cartella. "Gestisci configurazione automatica" compare solo se c'è almeno un passo ancora da fare; il pulsante "Ricomincia" non c'è più (resta "Ricontrolla").
- **Configurazione automatica** (`services/autoInstall.ts`, `run_stream`/`run_cancel` nel backend, Windows): "Gestisci configurazione automatica" (solo se c'è qualcosa da fare: un passo non fatto o un prerequisito mancante) esegue tutto dall'app, senza dialog né finestre. Verifica i prerequisiti; installa con winget quelli che mancano e che l'app sa installare (Node.js, Git, Rust, Build Tools e Visual Studio 2022 con i carichi di lavoro, .NET SDK 8/9, .NET Framework Developer Pack, Python, JDK, Go, PHP, Ruby, CMake, WebView2, MinGW, Docker, PostgreSQL, MySQL, SQL Server, Android Studio, pnpm, Yarn; pacchetto scelto in base alla versione richiesta), mostrando sul singolo prerequisito la fase (scarico con percentuale, verifica, installazione) letta dall'output di winget; poi ricontrolla e il prerequisito si spunta da solo. Se ne resta qualcuno da installare si ferma e lo dice. Poi esegue i passi uno dopo l'altro nella cartella del progetto (output riga per riga, ogni comando riuscito si spunta da solo, al primo errore si ferma con l'output); i passi a mano e i link aspettano "Fatto, continua". "Interrompi" ferma tutto. Per i prerequisiti sconosciuti (o non installati) l'**IA locale** cerca il pacchetto winget, accettato solo se `winget show` lo trova (mai comandi proposti dall'IA); senza IA attiva si consiglia di attivarla. Lo script .cmd si può ancora salvare (icona accanto al pulsante) per eseguirlo altrove.
- **Stack dai file del progetto**: lo stack si ricava dai file della cartella del progetto (anche di rete): radice e, se lì non c'è un progetto riconoscibile, le sottocartelle fino a due livelli (es. `src\App\App.csproj`, `frontend\package.json`, `backend\pom.xml`; esclusi `node_modules`, `bin`, `obj`, `dist`…), con i passi eseguiti nella sottocartella giusta. Una cartella che non si legge non diventa più uno stack vuoto in silenzio: l'errore viene spiegato. Nello Stack, "Rileva dai file del progetto" (admin) rilegge la cartella e aggiunge quanto trovato senza cancellare nulla; se lo stack non ha ancora tecnologie lo propone un riquadro.
- **Cartelle di rete** (`services/fsErrors.ts`): ogni cartella scelta o scritta (cartella dei progetti, cartella Dati, cartella del progetto, "Apri cartella") viene verificata prima dell'uso: radice raggiungibile (`\\server\condivisione` o unità `Z:`), cartella leggibile e, dove serve, scrivibile (file di prova creato e tolto). Gli errori del sistema diventano spiegazioni: server non raggiungibile (53), condivisione inesistente (67), accesso negato (5), credenziali non valide (1326/86), credenziali in conflitto (1219), accesso guest bloccato (1272), connessione interrotta (64), timeout (121), unità mappata scollegata o non visibile all'app avviata come amministratore (3/15/21), file in uso (32/33)…, con il codice tra parentesi; valgono anche per i salvataggi e l'apertura del workspace. La radice di ogni percorso usato viene inoltre consentita esplicitamente al plugin fs (comando Rust `allow_paths`), così i percorsi di rete funzionano anche riaperti dopo un riavvio.
- **Strumenti AI** (nella pagina Stack): connettori, plugin e skill del progetto; per le skill si allega il file (es. `SKILL.md`, fino a 512 KB) o si incolla il contenuto, che resta nel file del progetto e si può vedere, copiare o salvare.

Dati nel file del progetto: `stack` (con `files` per i file iniziali e `doc` per il documento di architettura) e `aiTools` (vedi schemi in `types/index.ts`); gli elementi hanno `assigneeId`.

## 9d. Commit git → task completato

Scopo: far capire in modo semplice come collegare un commit a un task e chiudere il task in automatico dal commit; nient'altro.
- **Solo se la cartella del progetto contiene `.git`** (cartella o file): altrimenti non compare nulla.
- **Codice del task**: ogni task ha un numero progressivo nel progetto (non riusato, nemmeno dopo un'eliminazione) e il codice `TODO-<n>`. Nel dettaglio del task un riquadro "Completa da un commit" mostra la frase da scrivere nel messaggio, `chiude TODO-12` (in inglese `closes TODO-12`), con "Copia". Valgono anche `chiudi`, `risolve`, `closes`, `fixes`, `resolves`…, e più task insieme: `chiude TODO-3, TODO-4`. Una semplice citazione ("lavoro su TODO-12") non chiude nulla.
- **Chiusura automatica**: all'apertura del progetto o di una sua sezione, e al ritorno sulla finestra, l'app legge in sola lettura gli ultimi commit del ramo corrente (`git log`, senza shell e senza finestra; se git non è installato, il reflog di `.git`). Quando trova `chiude TODO-12` completa il task e lo annota ("Completato dal commit a1b2c3d di Anna" con l'oggetto del commit). Alla prima lettura i commit già presenti si segnano come visti senza chiudere nulla.
- **Ogni commit vale una volta sola**: un task riaperto a mano non viene richiuso dallo stesso commit (la nota del commit sparisce alla riapertura). Si chiudono solo i task da fare.
- **Interruttore** nello Stack per l'admin ("Chiudi i task dai commit git"), attivo di default quando c'è `.git`.
- Non si scrive mai nulla nel repository: niente hook, niente modifiche.

## 9e. IA locale

Scopo: un'analisi più precisa dei progetti e altre funzioni assistite **senza servizi esterni**: il modello gira sul PC dell'utente (installazione gratuita) e i dati non escono mai dal PC. Funziona anche in una rete interna senza Internet, una volta installato il modello.

- **Motore**: [Ollama](https://ollama.com) (predefinito, `http://127.0.0.1:11434`) oppure un server **compatibile OpenAI** avviato sul PC (LM Studio, Foundry Local…, es. `http://127.0.0.1:1234/v1`). Modello consigliato **Qwen 3 4B** (`qwen3:4b`, Apache 2.0, circa 2,5 GB); per le somiglianze `nomic-embed-text` (circa 270 MB).
- **Solo questo PC**: l'app comunica soltanto con indirizzi di loopback (`127.0.0.1`, `localhost` risolto sempre su 127.0.0.1, `::1`). Il controllo è nel backend Rust (`ai.rs`): un indirizzo esterno viene rifiutato prima di connettersi, i proxy di sistema sono ignorati e i redirect non si seguono. I permessi verso Internet dell'app non cambiano.
- **Impostazioni › IA locale** (per PC, per qualunque utente, spenta di default; scheda tra Dati utente e Notifiche): con la casella "Usa l'IA locale su questo PC" spenta i campi sono disattivati. **Ollama si configura da solo** (`services/ollamaSetup.ts`, `src-tauri/src/ollama.rs`): accesa la casella si cerca Ollama sul PC; se **manca si installa** (Windows: lo script `install-local-ai.ps1`, incluso nell'eseguibile e quindi anche nella versione portable, con `-ForApp` scarica l'installer ufficiale da ollama.com con l'avanzamento, lo esegue solo se firmato da Ollama, per l'utente, e avvia il server; si può annullare finché non inizia l'installazione vera e propria), se è **spento si avvia** (`ollama serve`, senza finestra). Indirizzo e modelli si compilano con i valori consigliati e la connessione **si verifica da sola**, anche a ogni modifica: niente pulsante "Prova connessione". Se l'installazione non riesce: "Installa Ollama" per riprovare e "Scarica Ollama" (sito). Riaprendo le Impostazioni con l'IA già attiva si ricontrolla senza installare. Con **Compatibile OpenAI** (LM Studio, Foundry Local…) si configura a mano e si prova con **"Prova connessione"**. In entrambi i casi l'esito dice se il motore risponde, quanti modelli ha e se ci sono quelli scelti; con Ollama **"Scarica i modelli mancanti"** con barra di avanzamento e Annulla (è Ollama a scaricarli dal suo catalogo; l'app parla solo con Ollama).
- **Installer Windows**: nella pagina di benvenuto la casella facoltativa, **non spuntata**, "Installa anche l'IA locale gratuita (Ollama + modello Qwen 3 4B, circa 4 GB da scaricare)". Se spuntata, a fine installazione `install-local-ai.ps1` scarica Ollama (solo se firmato da Ollama), lo installa per l'utente e gli fa scaricare i modelli. Senza connessione o in caso di errore un avviso spiega che l'app è installata e l'IA si può attivare dopo: l'installazione dell'app non fallisce. Nelle installazioni silenziose, passive e negli aggiornamenti la casella non compare. Con il solo eseguibile, l'IA si configura dalle Impostazioni. Al primo avvio, se l'app trova già Ollama con il modello consigliato (es. installato dall'installer), attiva l'IA da sola, una volta sola, con un avviso.
- **Banner**: finché l'IA locale non è attiva, in alto e in sovrimpressione, uguale in tutte le sezioni e per tutti gli utenti: "Attiva l'IA locale per potenziare Todo Doto: analisi dei progetti più precisa, configurazione più accurata e altre funzioni assistite. Funziona tutto sul tuo PC, senza connessioni esterne." con **"Apri Impostazioni"** (scheda IA locale) e la **X**: chiuso, non ricompare più su quel PC. Sparisce attivando l'IA.
- **Stack, "Rileva dai file del progetto"**: un solo pulsante e un solo passaggio, con o senza IA. Prima l'analisi deterministica (ciò che i file dicono con certezza, salvato subito); poi, se l'IA è attiva, un'analisi approfondita di quanto letto che **propone solo ciò che manca** (prerequisiti, passi di preparazione, variabili d'ambiente dai file `.env` di esempio, note). Le proposte compaiono in "Altri elementi da aggiungere?" e l'amministratore sceglie quali aggiungere; nulla di quanto c'è viene cambiato. Senza IA, o se non risponde, il risultato è quello di sempre.
  - **Cosa riceve il modello**: solo l'elenco delle cartelle e i file che l'analisi ha già letto (6.000 caratteri per file, 20.000 in tutto, lockfile esclusi), ripuliti dai segreti (chiavi private, token noti, password, credenziali negli URL), i **nomi** delle variabili dei file `.env.example`/`.sample`/`.template` e il risultato deterministico. **Mai** `.env`, chiavi e certificati, `.npmrc`, `appsettings*.json`, `web.config`, file "credentials/secret", `.git/config`.
  - **Verifica della risposta**: vincolata a uno schema JSON e validata; si scartano doppioni, prerequisiti esclusi dai file, passi di avvio/build/test, cartelle fuori dal progetto, comandi di verifica che non siano semplici richieste di versione, link non https. Gli indirizzi di download dei prerequisiti vengono solo dal catalogo.
- **Altre funzioni** (compaiono solo con l'IA attiva; sono sempre proposte da confermare):
  - **Come risolvere** (Stack, prerequisito non verificato): spiegazione dell'esito e passi; i comandi suggeriti si copiano, non si eseguono, e quelli pericolosi (cancellazioni, script scaricati, redirezioni) vengono scartati.
  - **Da un testo** (Todo): da appunti, una mail o un verbale ai task proposti, con titolo e priorità modificabili; si creano solo quelli scelti.
  - **Task simili** (nuovo task): mentre si scrive, un avviso elenca i task già presenti con lo stesso significato (non blocca).
  - **Ricerca per significato** (ricerca globale): dopo i risultati per testo, i task vicini per significato (es. "autenticazione" trova "Pagina di accesso").
  - **Commit senza «chiude TODO-n»** (Todo, progetti con `.git` e chiusura dai commit attiva): per i commit degli ultimi 14 giorni che non citano un task, l'IA propone quale task potrebbero aver completato; "Completa" lo chiude annotando il commit, "Ignora" lo scarta. Ogni commit si esamina una volta su questo PC; la regola "chiude TODO-n" non cambia.
  - **Riepilogo della settimana** (home del workspace): completati, nuovi, in ritardo e in scadenza dei progetti visibili, scritto a partire solo da questi dati; si copia.
  - **AGENTS.md / CLAUDE.md** (Strumenti AI, amministratori): istruzioni per gli agenti di programmazione scritte dallo Stack, da rileggere e modificare; si salvano nella cartella del progetto solo con "Salva" (se il file c'è già, dopo conferma).

## 9f. Lavoro di squadra e fuori ufficio (0.3.0)

- **Chi lavora a cosa** (workspace di rete). Nel dettaglio del task, **«Ci sto lavorando»**: un task per volta (sceglierne un altro sposta l'indicazione), «Ho smesso» per toglierla. Nella riga del task una pastiglia verde di altezza fissa con gli avatar (massimo due, poi «+N») accanto al titolo: la riga non cambia altezza e le colonne non si spostano, si accorcia solo il titolo. Nella **Panoramica** (nuova voce in cima alla barra laterale, con il numero di persone al lavoro) l'elenco «Chi lavora a cosa», con progetto e da quanto; clic per aprire il task. Niente indicazioni fantasma: si mostrano solo quelle rinnovate di recente, su task ancora da fare, in progetti che l'utente vede, di utenti del workspace.
- **Roadmap per il cliente** (intestazione del progetto). Pagina HTML autonoma (stili inclusi, nessuno script né risorsa esterna) con avanzamento, attività pianificate per mese, da pianificare e completate di recente. Dei task solo la prima riga del titolo, l'etichetta e le date: mai descrizioni, commenti, domande, allegati, priorità o percorsi; le idee «da valutare» e gli assegnatari solo se richiesti. Anteprima nel dialog, si salva dove sceglie l'utente; per un PDF la si apre e si stampa.
- **Configura questo PC** (Panoramica). Un solo elenco di ciò che manca a questo PC per tutti i progetti visibili, dalle verifiche dei prerequisiti: lo stesso programma chiesto da più progetti si installa una volta; versioni diverse che possono convivere (Python, JDK, .NET SDK) si installano tutte, altrimenti vince quella per la versione più alta. Installazione con winget dall'app, con fase e avanzamento, poi nuova verifica. Ciò che l'app non sa installare resta «da installare a mano» con il link allo Stack del progetto. Un avviso nella Panoramica segnala quanti programmi mancano e per quanti progetti.
- **Stack non aggiornato**. Aprendo un progetto con uno Stack si rileggono in background i file della sua cartella (solo lettura, gli stessi di «Rileva dai file del progetto», al massimo ogni 10 minuti) e si confrontano con lo Stack salvato. Le differenze (versioni dichiarate, prerequisiti non più necessari, tecnologie, passi e variabili nuove) compaiono in un avviso nell'intestazione: l'amministratore aggiorna con un clic (con «Annulla»), chiunque può ignorarle su questo PC finché non ne compaiono di nuove.
- **Portatile fuori ufficio** (workspace di rete; Impostazioni › Dati utente, «Tieni una copia del workspace su questo PC», attiva di default). Dopo ogni cambiamento l'app salva una copia del workspace nei propri dati sul PC (cifrata come il workspace, o con DPAPI). Se la cartella condivisa non risponde — all'apertura o mentre si lavora — si continua sulla copia: in alto «Fuori ufficio · N progetti da inviare». Si possono modificare task e progetti esistenti (stato, scadenze, commenti, nuovi task…); creare progetti, cambiare utenti, cartelle o impostazioni aspetta il ritorno. Quando la cartella torna raggiungibile (o all'apertura successiva in ufficio) le modifiche si uniscono **campo per campo** a quelle dei colleghi (`services/merge3.ts`): ciò che è cambiato solo da una parte si tiene; se lo stesso campo dello stesso task è cambiato da entrambe vince la versione condivisa e la propria compare nel resoconto «Modifiche fatte fuori ufficio»; commenti, domande e allegati si uniscono per id; i task creati offline ricevono un numero TODO libero; un task eliminato da un collega non torna. La cronologia scritta offline si aggiunge al ritorno.
- **App gratuita**. Licenze e abbonamenti sono sospesi (codice commentato nel sito). Impostazioni › Generali e il sito hanno «Sostieni Todo Doto» con una donazione PayPal facoltativa.

## 9g. Ufficio: VPN, accesso aziendale, email e Teams (0.4.0)

- **VPN** (Impostazioni › Dati utente, per PC e per workspace). Elenco delle VPN configurate in Windows (`Get-VpnConnection`, anche quelle per tutti gli utenti), scelta di una, «Collega ora» e «Collega da sola quando la cartella condivisa non risponde» (predefinito). Il collegamento usa `rasdial <nome>` con le credenziali salvate in Windows; se Windows chiede utente e password si apre il pannello VPN di Windows. Si prova all'apertura del workspace e quando la cartella cade, al massimo ogni 2 minuti; con il badge «Fuori ufficio» c'è anche «Collega <VPN>». Il nome si accetta solo se è nell'elenco di Windows; nessuna shell.
- **Accesso aziendale** (Impostazioni › Dati utente, amministratori). Con «Riconosci gli utenti dall'account di dominio» l'utente si riconosce dal SID dell'account Windows (Active Directory o Entra ID, letto con `whoami /user /groups`): la stessa persona su più PC è un solo utente. Facoltativi i gruppi degli amministratori e dei Cleaner: il ruolo di ognuno si aggiorna quando apre il workspace (Membro se in nessun gruppo); chi attiva i gruppi deve far parte di uno di quelli degli amministratori e l'ultimo amministratore non perde mai il ruolo. La password del workspace resta (protegge i dati e la cifratura).
- **Email e Teams** (Impostazioni › Email e Teams; Stack del progetto › Canale Microsoft Teams). Tutto facoltativo:
  1. «Invia per email» nel dettaglio del task, nella roadmap e nel riepilogo della settimana: apre il programma di posta (`mailto:`), nessuna connessione dall'app.
  2. Canale Teams per progetto: l'amministratore incolla l'indirizzo di un Workflow («Pubblica in un canale quando viene ricevuta una richiesta webhook»; accettati solo `*.logic.azure.com`, `*.powerplatform.com`, `*.powerautomate.com`, `*.webhook.office.com` in https) e sceglie gli eventi (task creati, completati, assegnazioni, domande, menzioni). Lo invia il PC di chi fa la modifica, come scheda Adaptive Card; senza Internet si riprova più tardi.
  3. Metodo di invio delle email del workspace: Outlook del PC di chi invia (automazione COM) o server SMTP aziendale (STARTTLS, TLS o nessuna sicurezza per la sola rete interna; password cifrata con quella del workspace e cifrata di nuovo quando cambia). «Invia una prova a me».
  4. Ogni utente indica la sua email e se riceverla per menzioni, task assegnati e il punto della giornata. Le email partono dal PC di chi fa l'azione, solo a chi vede il progetto.
  5. Il punto della giornata: dopo l'ora scelta, il primo PC di un amministratore aperto lo manda una volta (segnaposto in `mail/`), con task in ritardo, in scadenza nei prossimi 3 giorni, completati nelle ultime 24 ore e domande aperte, solo dei progetti che ognuno vede.
- **Team grandi**: vedi §4 (cronologia per mese e per PC, giornale delle modifiche, capitoli) e §6 (controllo adattivo).

## 10. Fuori ambito (prima versione) e possibili evoluzioni

- Sincronizzazione cloud, notifiche push, app mobile.
- Evoluzioni: notifiche desktop sui tag `@utente`, accesso con Microsoft Entra ID (SSO), avviso istantaneo nella rete locale e nodo di sincronizzazione per organizzazioni molto grandi (vedi ROADMAP-TECNICA.md).
