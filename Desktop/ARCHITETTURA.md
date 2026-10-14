# Architettura del codice

Come è organizzato Project Goal Manager, quali sono i pezzi riutilizzabili, come si estende e come si tiene sotto test. Le specifiche funzionali sono in [PROGETTO.md](./PROGETTO.md); avvio e build in [README.md](./README.md).

---

## 1. Vista d'insieme

```
            ┌────────────────────────────── Vue 3 (WebView2) ──────────────────────────────┐
            │  views/            pagine instradate dal router                               │
            │  components/       UI generica (ui/) · board · detail · layout · dialogs      │
            │        │  usano                                                                │
            │  stores/           Pinia: workspace (dati + mutazioni), session, ui           │
            │        │  usano                                                                │
            │  services/         logica pura e I/O: storage, fs, crypto, config, items, ids │
            │        │                                                                       │
            │  types/            schemi zod + tipi TypeScript (unica fonte di verità)       │
            └───────────────────────────────────┬───────────────────────────────────────────┘
                                                │ @tauri-apps/plugin-fs / dialog / opener / api
            ┌───────────────────────────────────▼───────────────────────────────────────────┐
            │  src-tauri/ (Rust)   un comando (`get_identity`) + plugin ufficiali            │
            └───────────────────────────────────┬───────────────────────────────────────────┘
                                                ▼
                         cartella workspace (JSON) · %APPDATA% (config e credenziali)
```

Regola delle dipendenze: **le frecce vanno solo verso il basso**. Un componente può usare uno store e un servizio; un servizio non conosce né Vue né Pinia; `types/` non importa nulla. Questo rende i servizi testabili con un semplice `import`, e i componenti sostituibili senza toccare la logica.

---

## 2. Struttura delle cartelle

```
src/
  main.ts                  bootstrap: Pinia, router, dayjs (locale it), stile
  App.vue                  shell: riapertura ultimo workspace, host di toast e conferme
  style.css                token di tema (chiaro/scuro), classi di base (.field, .menu-*)
  router/index.ts          rotte: / (welcome) · /w (workspace) → home, p/:id, members
  types/index.ts           enumerazioni, schemi zod, tipi; formato dei file su disco
  services/
    fs.ts                  astrazione del filesystem: Tauri oppure in memoria (browser/test)
    storage.ts             WorkspaceStorage: file del workspace, mutazioni read-before-write, firma
    crypto.ts              PBKDF2 (hash password) e AES-GCM (password memorizzata)
    config.ts              config.json e credentials.json in appDataDir
    items.ts               ordinamento, scadenze, ricerca, filtri, conteggi (funzioni pure)
    changes.ts             confronto fra due versioni di un progetto → elenco di modifiche (per le notifiche)
    preview.ts             tipo di anteprima da nome/MIME e costruzione del contenuto (blob URL / testo)
    analytics.ts           riepilogo numerico del workspace (pagina Analisi) e script .cmd di configurazione (sezione Stack)
    drive.ts               client Google Drive: PKCE, token, elenco ricorsivo, download/esportazione
    http.ts                fetch per API esterne (plugin http in Tauri, window.fetch altrove)
    ids.ts                 generazione id con prefisso (prj_, itm_, …) e timestamp
  stores/
    session.ts             identità locale (utente@macchina), config per macchina, recenti
    workspace.ts           stato del workspace aperto e TUTTE le mutazioni; aggiornamento live; cronologia
    notifications.ts       notifiche interne (per macchina), preferenze per tipo
    drive.ts               collegamento Google (per macchina) e cartella sincronizzata (per workspace)
    ui.ts                  tema, toast, elemento selezionato, ricerca, lampeggio righe
  composables/
    useConfirm.ts          dialog di conferma come Promise<boolean>
  components/
    project/               sezioni del progetto: ProjectStack (stack, prerequisiti, passi guidati, script) e ProjectAiTools (connettori, plugin, skill)
    ui/                    generici, senza conoscenza del dominio
    board/                 lista del progetto: riga, composer, selettori, allegati
    detail/                pannello elemento: commenti, domande, testo con menzioni
    layout/                TopBar, SideRail (albero), FolderNode, ProjectLink, DetailPanel
    dialogs/               form modali: workspace, password, progetto, allegato, nome, impostazioni
  views/                   WelcomeView, WorkspaceView (layout), WorkspaceHomeView, ProjectView, MembersView,
                           DriveView (esplorazione della cartella replicata), AuditView (cronologia, admin),
                           AnalyticsView (riepilogo numerico, admin)
  test/setup.ts            setup Vitest: Pinia pulita e filesystem in memoria azzerato a ogni test
e2e/app.spec.ts            test end-to-end Playwright
src-tauri/                 backend Rust, configurazione finestra, permessi (capabilities)
```

---

## 3. I livelli, uno per uno

### 3.1 `types/` — il contratto dei dati

Ogni struttura salvata su disco ha uno **schema zod** (`ProjectSchema`, `TreeFileSchema`, …) e il tipo TypeScript è derivato con `z.infer`. Vantaggi:

- un file JSON scritto da una versione più vecchia o corrotto viene validato alla lettura, con valori di default per i campi mancanti (`.default(...)`) — è il meccanismo di **migrazione implicita**;
- le enumerazioni (`PRIORITIES`, `STATUSES`, `BUCKETS`) e le etichette (`PRIORITY_LABEL`…) stanno in un posto solo: aggiungere una priorità significa toccare `types/index.ts`, `style.css` (token colore) e nient'altro.

### 3.2 `services/fs.ts` — un solo filesystem, due implementazioni

`getFs()` restituisce un oggetto `FsApi` (read/write atomica/exists/mkdir/readDir/remove/stat/watch/join/dialog/openExternal/identity).

- **In Tauri** usa i plugin ufficiali; `writeTextAtomic` scrive un `.tmp` e lo rinomina sopra l'originale (con ripiego a scrittura diretta sugli share che rifiutano il rename).
- **Fuori da Tauri** (browser con `npm run dev`, Vitest, Playwright) usa un filesystem **in memoria** con la stessa interfaccia, compreso il watcher.

È il motivo per cui l'intera app si può provare e testare senza compilare Rust. Qualunque nuovo accesso al disco passa da qui: mai importare `@tauri-apps/plugin-fs` altrove.

### 3.3 `services/storage.ts` — il workspace su disco

`WorkspaceStorage(root)` conosce il layout della cartella e offre:

| Metodo | Uso |
|---|---|
| `create(meta, users)` | inizializza una cartella vuota |
| `readMeta/readUsers/readTree/readProject/listProjectIds` | letture validate con zod |
| `writeMeta/writeUsers/writeTree/writeProject/deleteProject` | scritture atomiche |
| `mutateProject(id, actorId, fn)` | **rilegge** il file, applica `fn`, incrementa `version`, aggiorna `updatedAt/By`, scrive. Se `fn` ritorna `false` non scrive. |
| `mutateTree(fn)`, `mutateUsers(fn)` | stesso schema per i file condivisi |
| `signature()` | mappa `file → "mtime:size"`, usata per capire cosa è cambiato |
| `readDrive/writeDrive` | struttura Google Drive replicata (`drive.json`) |
| `readAudit/appendAudit` | cronologia append-only (`audit.json`, ultimi 5000 eventi) |
| `watch(cb)` | notifiche del filesystem (best effort) |

Il pattern **read-before-write** è la garanzia di coerenza fra più PC: due modifiche concorrenti allo stesso progetto si sommano invece di sovrascriversi, perché ciascuna parte dall'ultima versione sul disco.

### 3.4 `stores/workspace.ts` — stato e mutazioni

È l'unico punto in cui i dati del workspace vengono modificati. Espone:

- **stato**: `status` (`closed | opening | locked | open | unreachable`), `meta`, `users`, `tree`, `projects` (dizionario per id), `lastError`;
- **derivati**: `currentUser`, `isAdmin`, `isNetwork`, `isCleaner`, `canPurge`, `canTrashItem(item)`, `visibleProjects` (filtro membri), `trashedProjects`, `recentProjects`, `favoriteProjects`, `foldersByParent`, `labelsById`, `userName(id)`;
- **ciclo di vita**: `open(path)` → eventualmente `unlock(password)` → `close()`; `create(opts)`;
- **mutazioni** raggruppate per dominio (progetti, elementi, commenti/domande, allegati, cartelle, etichette, stack/strumenti AI, utenti/accesso).

Tutte le mutazioni passano da tre helper interni, che è il modo in cui si aggiunge una nuova operazione senza duplicare codice:

```ts
mutateProject(id, (p) => { ... })                 // qualunque campo del progetto
mutateItem(projectId, itemId, (it, p) => { ... })  // un elemento (aggiorna updatedAt)
mutateQuestion(projectId, itemId, qId, (q) => { ... })
```

`guard(fn)` incapsula ogni accesso al disco: in caso di errore mostra un toast e registra `lastError`, senza far cadere l'app. `record(action, project, item)` aggiunge una voce alla cronologia dopo le operazioni che la riguardano.

**Permessi, in un posto solo.** Le regole stanno nello store e la UI le consuma: `canPurge` (solo admin) per le eliminazioni definitive; `canTrashItem(item)` (assegnatario, creatore se non assegnato, Cleaner, admin) per spostare nel cestino; `canSee(p)` per la visibilità dei progetti. **Stack e Strumenti AI sono modificabili solo dagli admin** per scelta: sono la "verità" del progetto (con cosa è fatto, come si configura, quali strumenti si usano), a differenza di allegati e cartelle che sono materiale di lavoro di tutti. Le viste mostrano ai membri una nota ("l'amministratore non ha ancora…") invece di una pagina vuota.

**Aggiornamento live.** `startWatching()` attiva watcher + polling (4 s) + refresh al focus della finestra. `refresh()` confronta la firma dei file con l'ultima nota e ricarica **solo** i file cambiati; se il cambiamento viene da un altro utente mostra "Aggiornato da …" e fa lampeggiare le righe toccate. Le chiamate concorrenti vengono accodate, non perse, e una lettura iniziata prima di una scrittura locale non può sovrascrivere lo stato più recente: ogni scrittura locale incrementa `writeGen` e il refresh scarta i risultati letti con una generazione più vecchia (più il controllo su `version` per i progetti). Dalle differenze fra versione precedente e nuova (`services/changes.ts`) nascono le **notifiche** per i progetti di cui si fa parte. Questi casi limite sono coperti dai test dello store.

**Notifiche e cronologia sono due pipeline distinte, e complementari.** La cronologia (`audit.json`, `record()`) è il registro condiviso, scritto da chi compie l'operazione, limitato alle operazioni sugli elementi e sui progetti. Le notifiche sono per utente e per macchina (localStorage) e hanno due sorgenti: a workspace aperto, il diff dei progetti (copre tutto: domande, risposte, commenti, descrizioni, assegnazioni); all'apertura, `notifications.ingestAudit()` rilegge la cronologia e trasforma in notifiche le operazioni altrui successive all'ultimo istante "visto" (`touchSeen()`, aggiornato a ogni refresh riuscito). Così chi era offline ritrova almeno creazioni, completamenti e cestinazioni; gli id delle notifiche derivate (`aud:<id voce>`) le rendono idempotenti. Se un giorno servisse recuperare anche domande e commenti offline, la strada è registrarli nella cronologia, non una terza pipeline.

**Campi deprecati.** `tree.json` delle prime versioni conteneva `categories` e i progetti `categoryId`: le categorie sono state sostituite dalle cartelle. Lo schema zod li legge e li scarta (`TreeFileSchema` con `transform`, `categoryId` opzionale), così i file esistenti restano validi; lo store e la UI non li conoscono più. Non vanno riutilizzati.

### 3.5 `stores/session.ts` e `stores/ui.ts`

`session` conosce l'identità locale (`utente@macchina`, da Rust) e la configurazione per macchina (tema, workspace recenti). `ui` tiene ciò che è solo visuale: tema, toast, elemento selezionato, testo della ricerca globale, righe da far lampeggiare. Nessuno dei due tocca il disco del workspace.

### 3.6 Componenti

**`components/ui/` — generici, riusabili ovunque** (nessuna dipendenza dagli store, tranne dove indicato):

| Componente | Cosa fa |
|---|---|
| `BaseButton` | varianti `primary/outline/ghost/soft/danger`, taglie `sm/md/icon/icon-sm` |
| `BaseDialog` | modale accessibile (Reka UI) con titolo, descrizione, slot `footer`, autofocus via `data-autofocus` |
| `BaseMenu` | menu a tendina da una lista `MenuItem[]` (`label, icon, danger, disabled, sep, onSelect`) |
| `MenuTriggerButton` | il pulsante "⋯" che apre un `BaseMenu`, visibile all'hover del contenitore `.group` |
| `SegmentedControl` | gruppo di opzioni esclusive, generico sul tipo del valore |
| `UserAvatar` | iniziali con colore stabile derivato dal nome |
| `ChipsInput` | elenco di valori come chip con suggerimenti (linguaggi, framework…) |
| `ToastHost`, `ConfirmHost` | host globali montati una volta in `App.vue` |
| `BrandMark` | il segno dell'app (quattro barre di priorità) |

**`components/board/`** — la lista: `ItemRow` (riga con barra di priorità, selettori inline e tastiera: ↑/↓, Invio, C, Canc), `ItemRowActions` (il menu "⋯" della riga), `FilterBar` (scadenza, stato, priorità, **Assegnato a** e **Creato da** come filtri distinti, etichetta), `PrioritySelect`, `StatusSelect`, `DueDateField`, `LabelSelect`, `AssigneeSelect` (riusati nel dialog di creazione e nel pannello di dettaglio), `AttachmentsBoard`.

**`composables/useItemActions.ts`** — le azioni su un elemento (completa, riapri, cestina con "Annulla", elimina definitivamente), il menu che le espone e le scorciatoie, in un unico posto: `ItemRow`, `ItemRowActions` e `DetailPanel` lo usano, così permessi, conferme e messaggi sono identici ovunque. Una nuova azione sull'elemento si aggiunge qui e compare in tutti e tre.

**`components/layout/`** — `TopBar` (menu del workspace: Impostazioni, Etichette, Membri, Analisi e Cronologia per gli admin, Scorciatoie; Drive; notifiche; tema), `GlobalSearch` (ricerca in tutti i progetti: nome del progetto, elementi, allegati; risultati raggruppati, ↑/↓ e Invio; `services/items.searchAll`), `SideRail` (Preferiti, Recenti — solo da 5 progetti in su —, Progetti, Cestino), `DetailPanel`.

**`components/detail/`** — `MentionTextarea` (textarea con autocompletamento `@utente`, Invio per inviare), `RichText` (menzioni e link evidenziati), `ItemComments`, `ItemQuestions`.

**`components/dialogs/`** — ogni form modale è autonomo: riceve `v-model:open` e, se serve, l'entità da modificare; chiama lo store e chiude. `NameDialog` è il form generico "chiedi un nome (e un colore)" usato per cartelle e cartelle di allegati. `ShortcutsDialog` elenca le scorciatoie (tasto `?`). Convenzione sui verbi: **Crea** quando si inserisce, **Salva** quando si modifica, in tutti i dialog.

### 3.7 Stile e tema

`style.css` definisce i colori come variabili CSS su `:root` e `.dark`, esposte a Tailwind con `@theme inline` (`bg-surface`, `text-ink-2`, `bg-p-alta`, …). Il tema si cambia aggiungendo/togliendo la classe `dark` su `<html>` (`ui.setTheme`), e `index.html` lo applica prima del primo paint per evitare il flash. Le classi costruite dinamicamente (`bg-p-${priority}`) sono dichiarate con `@source inline(...)` così Tailwind le genera sempre.

### 3.8 Backend Rust

`src-tauri/src/lib.rs` registra i plugin (`fs`, `dialog`, `opener`, `os`, `http`, `window-state`) e tre comandi: `get_identity`, `oauth_start` (apre una porta su 127.0.0.1) e `oauth_wait` (attende il redirect di Google e restituisce codice e stato). Il parser del redirect ha test unitari Rust (`cargo test`). I permessi sono in `capabilities/default.json`: il frontend può leggere/scrivere ovunque (`fs:scope **`, necessario per cartelle di rete scelte dall'utente), aprire URL e file. Aggiungere un comando Rust = funzione `#[tauri::command]` + `generate_handler!` + `invoke()` in `services/fs.ts`.

---

## 4. Flussi principali

**Apertura di un workspace di rete**
`WelcomeView` → `ws.open(path)` → legge `workspace.json`/`users.json` → se `mode = network`: cerca la password cifrata in `credentials.json` (`config.recallPassword`) e la verifica contro l'hash; se manca o non vale → `status = 'locked'` e `PasswordDialog` → `ws.unlock(pw)` → `rememberPassword` → `finishOpen()` (aggiunge l'utente a `users.json` se nuovo, carica tutto, avvia il watcher, aggiorna i recenti).

**Un'azione dell'utente** (es. "Completa")
`ItemRow` → `ws.moveItem(projectId, itemId, 'done')` → `mutateItem` → `storage.mutateProject` (rilegge, modifica, `version++`, scrive atomico) → `projects[id] = fresh` → Vue aggiorna la riga. Nessuno stato intermedio in memoria: lo store riflette sempre ciò che c'è sul disco.

**Una modifica di un collega**
watcher o polling → `ws.refresh()` → `storage.signature()` → per ogni file cambiato: ricarica → se `updatedBy ≠ me`: toast + `ui.flashItems(diff)`.

---

## 5. Come estendere

| Voglio… | Dove intervenire |
|---|---|
| un nuovo campo sull'elemento (es. `stima`) | `types/index.ts` (schema con `.default`), `ItemRow`/`DetailPanel` per mostrarlo, eventualmente `services/items.ts` per ordinarlo. I file esistenti restano validi grazie al default. |
| una nuova azione (es. "duplica elemento") | una funzione nello store costruita con `mutateProject`/`mutateItem`; una voce nel `menu` di `composables/useItemActions.ts` (compare in riga, menu e pannello). |
| un nuovo tipo di allegato | `AttachmentSchema.kind`, `AttachmentDialog` (segmento), `AttachmentsBoard` (icona), `fs.openExternal`. |
| una nuova pagina | `views/NuovaView.vue` + rotta figlia di `/w` in `router/index.ts` (`meta: { admin: true }` se riservata agli admin: il router rimanda alla home gli altri) + link in `TopBar` o `SideRail`. |
| una nuova sezione del progetto | un componente in `components/project/`, una voce in `SECTIONS` di `ProjectView` (la rotta `p/:id/:section?` è già pronta). |
| un nuovo dialog | copia `NameDialog` come modello: `v-model:open`, `watch(open)` per inizializzare, `BaseDialog` con slot `footer`. |
| una regola pura (ordinamento, filtri, ricerca, date) | `services/items.ts`, con test in `items.test.ts`. |
| una scorciatoia da tastiera | il gestore dove ha senso (`ItemRow` per la riga, `ProjectView` per la pagina, `GlobalSearch`/`TopBar` per tutto) e la riga corrispondente in `ShortcutsDialog`. |
| cambiare i colori | solo le variabili in `style.css`. |

Convenzioni: Composition API con `<script setup lang="ts">`; prop/emit tipizzati; testi dell'interfaccia in italiano, in sentence case, con verbi d'azione ("Crea progetto" → toast "Creato"); nessun accesso diretto al disco fuori da `services/`.

---

## 6. Test automatici

Tre livelli, tutti senza Rust e senza toccare il disco (filesystem in memoria):

| Livello | Strumento | File | Cosa garantisce |
|---|---|---|---|
| Unit — servizi | Vitest | `services/*.test.ts` | crittografia (hash/verifica, cifratura locale), storage (read-before-write, versioni, firma, validazione), regole su elementi (ordinamento, scadenze, ricerca, filtri, conteggi), differenze fra versioni di un progetto (notifiche) |
| Unit — store | Vitest + Pinia | `stores/workspace.test.ts` | flussi reali: creazione workspace locale/rete con password, progetti, elementi fra i contenitori, cestino di elementi e progetti, etichette, preferiti e recenti, cartelle a cascata, domande/risposte/risoluzione, menzioni, allegati, visibilità per membri (admin e non admin), ruoli e permessi di eliminazione (Cleaner), cronologia, notifiche con preferenze, **aggiornamento da modifiche esterne** |
| Componenti | Vitest + Vue Test Utils + happy-dom | `components/components.test.ts` | `BaseButton`, `SegmentedControl`, `UserAvatar`, `StatusSelect`, `PrioritySelect`, `RichText`, `MentionTextarea` (autocompletamento, Invio/Shift+Invio) |
| End-to-end | Playwright (Chromium) sulla build Vite | `e2e/app.spec.ts` | schermata iniziale e tema; workspace di rete e scelta dell'accesso ai progetti; sidebar (preferiti, recenti, cestino, cartelle a cascata); elementi via dialog, filtri, ordine dei tab, sola lettura dei completati, Salva nel dettaglio, cestino; etichette; allegati con anteprima interna; ricerca e scorciatoie; cronologia, notifiche e impostazioni; pagina Drive |

Comandi:

```bash
npm run typecheck     # vue-tsc, nessun errore di tipo
npm test              # unit + componenti (circa 8 s)
npm run test:e2e      # end-to-end; la prima volta: npx playwright install chromium
npm run test:all      # tutto, in sequenza (da eseguire prima di ogni build/rilascio)
```

Regole per mantenerli utili:

1. Ogni nuova mutazione nello store ha almeno un test nel file dello store, scritto come lo compirebbe l'utente (crea → agisci → verifica).
2. Ogni regola pura va in `services/` e viene testata lì, non attraverso i componenti.
3. Un bug trovato a mano diventa prima un test che fallisce, poi una correzione (così è nato il controllo su `version` in `refresh()`).
4. I test E2E non usano `waitForTimeout`: aspettano sempre una condizione visibile (`expect(...).toBeVisible()`), altrimenti diventano fragili.
5. `npm run test:all` deve essere verde prima di `npm run tauri build`.
