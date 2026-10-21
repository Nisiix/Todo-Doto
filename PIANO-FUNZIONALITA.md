# Todo Doto — piano delle funzionalità "non scontate"

Documento del 20 ottobre 2026, scritto a partire dallo stato reale del repository (app 0.4.0, `main`). Propone funzionalità che un'app di todo/roadmap di solito non ha, scelte perché aiutano chi la usa in tre direzioni: **analisi** (capire cosa sta succedendo), **gestione** (decidere e coordinare) e **semplificazione** (fare meno click e tenere ordine). Per ogni funzione: cosa fa, perché non è scontata, punti di forza, impatto tecnico e piano in cui collocarla.

Il piano di lancio (`PIANO-LANCIO.md`) resta valido: prezzi, posizionamento e calendario non cambiano. Qui si decide **cosa aggiungere** e **in quale piano**.

---

## 1. Da dove partiamo

Cosa l'app fa già, in sintesi (dettagli in `Desktop/PROGETTO.md`):

- Task con priorità, stato (Da valutare → Da definire → Confermato), scadenza, etichetta, assegnatario, commenti, domande con risposte e @menzioni; tre contenitori (Da fare, Completati, Cestino).
- Progetti in cartelle, preferiti, recenti, progetti riservati, ruoli (admin, cleaner, member), notifiche interne, cronologia (audit).
- Sezioni del progetto: **Stack** (prerequisiti, passi di configurazione, variabili, file iniziali, documento di architettura), **Todo**, **Gantt** (solo task confermati con scadenza), **Allegati** (file, link, Google Drive), **Strumenti AI**.
- Integrazioni con il codice: cartella del progetto sul PC, commit git che chiudono i task (`chiude TODO-12`), GitHub per sincronizzare lo Stack, verifica automatica dei prerequisiti sui PC dei colleghi (readiness) con installazione dei mancanti.
- Pagina **Analisi**: conteggi per contenitore, stato, priorità, scadenze, carico per utente e per progetto.
- **IA locale** (Ollama, tutto sul PC): task da un testo, task simili, ricerca per significato, commit che potrebbero chiudere un task, riepilogo della settimana, "come risolvere" un prerequisito, AGENTS.md dallo Stack.
- Copie di sicurezza giornaliere, due lingue, zero server: la verità è una cartella di file JSON.
- Dalla **0.3.0**: «Ci sto lavorando» e Panoramica di chi lavora a cosa, roadmap per il cliente (HTML/PDF), «Configura questo PC» con winget, avviso di Stack non aggiornato, lavoro fuori ufficio con unione campo per campo, cifratura dei dati sul disco.
- Dalla **0.4.0**: VPN dell'ufficio, accesso con l'account di dominio e ruoli dai gruppi AD, email e canale Teams per progetto, punto della giornata via Outlook o SMTP, cronologia per mese e per PC, progetti grandi divisi in capitoli.

**Modello commerciale attuale.** Dalla 0.3.0 Todo Doto è **gratuito**: licenze e abbonamenti sono sospesi, si accettano donazioni PayPal. Il codice delle licenze (firma Ed25519, piani, prova di 14 giorni) è nel ramo `lavoro-lancio-2026-10-15` e non in `main`. La §6 dice quindi *se* e *come* reintrodurre un piano a pagamento, non solo dove collocare le funzioni.

### Cosa è già coperto dalla 0.3–0.4 (e come cambia questo piano)

| Funzione proposta | Cosa c'è già | Cosa resta da fare |
|---|---|---|
| G5 · Attività git per task | «Ci sto lavorando» manuale, un task per volta | Dedurre «in lavorazione» dai commit e dal branch `todo-12-*`, senza clic. Le due cose si sommano: la pastiglia verde può nascere anche dal codice. |
| A7 · Rapporto di stato | Roadmap per il cliente (esterna, senza dettagli interni) | Il rapporto è **interno**: ritardi, domande, decisioni, carico. Riusa il generatore HTML autonomo della roadmap e l'invio per email/Teams. |
| S2 · Vista Oggi | Punto della giornata via email, Panoramica del team | La vista **personale nell'app**, con azioni dirette e il rinvio. Stessa interrogazione del punto della giornata: si scrive una volta. |
| A6 · Matrice readiness | «Configura questo PC» (solo il proprio PC) | La vista per l'amministratore su **tutti** i PC, e il «PC pronto» nel selettore dell'assegnatario. |
| S4 · Archivio | Capitoli per i progetti oltre 300 task | Il problema di prestazioni è risolto dai capitoli: l'archivio resta utile solo contro il disordine. Priorità abbassata. |
| A8 · Confronto fra date | Cronologia per mese e per PC | Nessun ostacolo: i file mensili rendono anzi più leggero leggere un intervallo. |
| G3 · Automazioni | Email e canale Teams già configurabili | Le regole possono usare **email e Teams come azioni** («avvisa il canale se un immediata resta senza assegnatario»): il valore della funzione sale. |
| G4 · Assenze | Accesso con account di dominio | Le assenze si legano all'identità di dominio, quindi valgono su ogni PC della persona. |

### Criteri usati per scegliere le funzioni

1. **Si calcola da dati che ci sono già** (date di creazione, conferma, completamento; cronologia; commit; readiness): niente nuovo onere di inserimento, o al massimo un campo facoltativo.
2. **Zero server, zero cloud**: tutto resta nella cartella del workspace o nel PC. È la promessa del prodotto.
3. **Compatibile all'indietro**: ogni campo nuovo ha un valore predefinito negli schemi zod, i file vecchi si leggono sempre.
4. **Funziona senza IA; con l'IA fa di più**: l'IA locale è un moltiplicatore, non un prerequisito.
5. **Coerente con la nicchia**: team di sviluppo e uffici IT di PMI che lavorano su una cartella di rete. Le funzioni "git-aware" e "PC-aware" sono il tratto distintivo rispetto a Trello, Planner ed Excel.

---

## 2. Analisi: capire cosa sta succedendo

### A1 · Tempi di ciclo e invecchiamento dei task

**Cosa fa.** Per progetto, etichetta, priorità e persona: tempo mediano da *creato* a *confermato*, da *confermato* a *completato*, e un grafico di "invecchiamento" dei task aperti (da quanti giorni è lì ogni task, a colonne per stato). Nella lista, un puntino sui task fermi da più di N giorni.

**Perché non è scontata.** Le app di todo contano i task; quasi nessuna dice *quanto tempo* ci vuole. Eppure è la domanda che un responsabile fa davvero: "quanto restiamo in Da definire?".

**Punti di forza.** Non richiede alcun dato in più: `createdAt`, `confirmedAt`, `completedAt`, `updatedAt` esistono già in `ItemSchema`. Funzione pura in `services/analytics.ts`, testabile come `summarize()`.

**Impatto tecnico.** Nessuna modifica ai file. Nuova sezione in `AnalyticsView.vue`, grafico a barre con CSS (nessuna libreria).

**Piano.** Free per il singolo progetto (è analisi personale); Team per il confronto per persona e per etichetta su tutto il workspace.

### A2 · Previsione di consegna ("a questo ritmo")

**Cosa fa.** Dal ritmo di completamento delle ultime 4–8 settimane calcola quando si esaurirà il lavoro confermato: "con il ritmo attuale (6 task/settimana) i 23 task confermati finiscono intorno al 28 novembre; con il ritmo peggiore delle ultime 8 settimane, il 19 dicembre". Mostra un intervallo, non una data secca. Se si inseriscono le stime in ore (A5), usa quelle.

**Perché non è scontata.** È la funzione dei tool "agile" costosi (Jira con plugin), mai di un todo. Qui si ottiene gratis perché i completamenti sono già datati.

**Punti di forza.** Risposta immediata alla domanda "ce la facciamo per la data X?". Esposta anche per progetto e per persona. Nessuna configurazione.

**Impatto tecnico.** Funzione pura su `completedAt`; una card in Analisi e una riga in cima al Gantt ("fine prevista").

**Piano.** Business: è la funzione da decisore, il motivo per cui un titolare paga di più.

### A3 · Segnali di stallo (pannello "Attenzioni")

**Cosa fa.** Elenco ordinato per gravità di ciò che sta andando storto *senza che nessuno l'abbia segnalato*:
- domande senza risposta da più di 3 giorni (soglia modificabile);
- task "immediata" senza assegnatario o senza scadenza;
- task confermati senza scadenza;
- task assegnati a chi non apre il workspace da 14 giorni;
- task fermi (nessuna modifica, commento o commit) da 21 giorni;
- task in ritardo con l'assegnatario che ne ha altri 5 in ritardo.

Ogni riga ha l'azione diretta (assegna, metti scadenza, rispondi).

**Perché non è scontata.** I filtri trovano quello che cerchi; questo trova quello che *non sai di dover cercare*.

**Punti di forza.** Rende utile la cronologia e le notifiche già raccolte. È il contenuto perfetto per il "riepilogo della settimana" dell'IA (già esistente), che così diventa più preciso.

**Impatto tecnico.** Funzione pura `signals(projects, audit, today)`; pannello nella home del workspace e nel progetto; notifica locale opzionale "3 nuove attenzioni".

**Piano.** Free dentro il singolo progetto; Team nella home e in Analisi (visione di workspace).

### A4 · Semaforo di salute del progetto

**Cosa fa.** Un indicatore verde/giallo/rosso accanto a ogni progetto nella barra laterale, calcolato da: quota di task in ritardo, età delle domande aperte, "immediata" non assegnati, PC dei membri non pronti (readiness), Stack incompleto. Cliccando si vede il perché e l'andamento delle ultime 8 settimane.

**Perché non è scontata.** Mostra lo stato *prima* di aprire il progetto. Con 30 progetti in cartelle, è l'unico modo per sapere dove guardare.

**Punti di forza.** Riusa A3 e la readiness. Il trend richiede solo di salvare uno snapshot settimanale dei punteggi (pochi numeri) in `health.json`.

**Impatto tecnico.** Nuovo file `health.json` (append-only, 52 settimane), scritto dal primo PC che apre il workspace in una settimana nuova, come già fanno i backup.

**Piano.** Team.

### A5 · Calendario del carico e collisioni di scadenze

**Cosa fa.** Griglia persone × settimane con il numero di scadenze (e, se inserite, le ore stimate) per cella. Le celle oltre la capacità sono evidenziate: "Mario ha 9 scadenze nella settimana del 3 novembre, 2 in altri progetti". Da qui si trascina un task su un'altra settimana o su un'altra persona.

**Campo nuovo, facoltativo.** `estimateHours` sul task e `weeklyHours` sull'utente (predefinito 0 = non usato). Senza stime la griglia conta le scadenze: già utile.

**Perché non è scontata.** La pagina Analisi attuale dice *quanti* task ha ciascuno; questa dice *quando* li ha, e vede le collisioni fra progetti diversi, cosa che nessuna vista per progetto può mostrare.

**Punti di forza.** Anticipa i ritardi invece di contarli dopo. È anche la base numerica di A2.

**Impatto tecnico.** Due campi con default; vista nuova in Analisi; spostamento tramite le stesse funzioni di `useItemActions`.

**Piano.** Team.

### A6 · Matrice "chi può lavorare su cosa"

**Cosa fa.** Tabella progetti × utenti con lo stato del PC di ciascuno per quel progetto (pronto, mancano 2 prerequisiti, mai verificato). Nel dialog di assegnazione, accanto al nome: "PC pronto" o "mancano Node.js, .NET".

**Perché non è scontata.** Nessun gestore di task sa se il collega *può* davvero lavorare sul progetto. Todo Doto lo sa già (readiness), ma oggi lo mostra solo a chi ha il PC non pronto.

**Punti di forza.** Trasforma un dato tecnico in una decisione di gestione: assegno a chi parte subito. Argomento di vendita unico.

**Impatto tecnico.** Solo lettura dei `readiness/<utente>.json` esistenti; una tabella e un'etichetta nel selettore assegnatario.

**Piano.** Team (la readiness esiste solo nei workspace di rete).

### A7 · Rapporto di stato per progetto e periodo

**Cosa fa.** In un click: "Stato del progetto X, 1–15 novembre": completati, nuovi, in corso con scadenza, in ritardo, domande aperte, decisioni prese (G6), prossime tappe (G2). Esce come testo (appunti negli appunti, Markdown) e come PDF stampabile; con l'IA locale attiva, un paragrafo introduttivo scritto a partire solo da quei dati.

**Perché non è scontata.** È il documento "da far vedere al capo" che oggi si compila a mano ogni lunedì. L'export CSV del ramo lancio esporta i dati; questo esporta il *racconto*.

**Punti di forza.** Costa poco (riusa `weekFacts()` di `aiAssist.ts` generalizzato a un intervallo) e si vede subito. Funziona senza IA.

**Impatto tecnico.** Servizio puro `statusReport(project, from, to)`; dialog con anteprima; stampa tramite la stessa via del PDF del ramo lancio.

**Piano.** Team (dove già sta il PDF). Il testo semplice potrebbe restare Free come assaggio.

### A8 · Cosa è cambiato tra due date

**Cosa fa.** Si scelgono due date (o due copie di sicurezza) e l'app mostra la differenza: task aggiunti, completati, spostati di scadenza (con "da → a"), riassegnati, cestinati; progetti nuovi o cestinati. Utile dopo le ferie, prima di una riunione o per capire "chi ha spostato tutte le scadenze".

**Perché non è scontata.** La cronologia è un elenco di eventi; questo è un *confronto di stati*, molto più leggibile. Le copie di sicurezza giornaliere (`.pgmbackup`) lo rendono possibile senza nuovi dati.

**Punti di forza.** Rende visibile il valore dei backup (oggi invisibile finché non serve). `diffProjects()` di `services/changes.ts` fa già il grosso del lavoro.

**Impatto tecnico.** Lettura di due backup, diff per progetto, vista a elenco con filtri. Nessun nuovo file.

**Piano.** Business (si appoggia ai backup, già Team, e alla cronologia illimitata, già Business).

---

## 3. Gestione: decidere e coordinare

### G1 · Dipendenze "bloccato da" e Gantt con le catene

**Cosa fa.** Su un task si indica "bloccato da TODO-7, TODO-12". Effetti: nella lista il task mostra un lucchetto finché i bloccanti non sono completati; nel Gantt le barre sono collegate da una linea e l'app avvisa se una scadenza è *prima* di quella del bloccante; completato il bloccante, chi è assegnato al task sbloccato riceve una notifica "ora puoi partire".

**Campo nuovo.** `blockedBy: string[]` sul task (default `[]`). Si evitano i cicli al salvataggio.

**Perché non è scontata.** I todo trattano i task come indipendenti; i progetti reali no. Il Gantt esistente senza dipendenze è una vista; con le dipendenze diventa uno strumento di pianificazione.

**Punti di forza.** Catena critica evidenziata (la sequenza di bloccanti più lunga): è il percorso che decide la data di fine. Si integra con A2 e A3 ("bloccato da un task senza assegnatario").

**Impatto tecnico.** Un campo, validazione dei cicli, linee SVG nel `GanttChart.vue`, una nuova notifica `unblocked`.

**Piano.** Team.

### G2 · Versioni (tappe) e note di versione dai task

**Cosa fa.** Un progetto ha delle tappe ("v1.3", "Rilascio cliente", data obiettivo). I task si legano a una tappa. Vista per tappa con avanzamento (12/18 completati, 2 in ritardo). Al raggiungimento, **"Genera note di versione"**: dai task completati della tappa (titolo, etichetta, commit che li hanno chiusi) l'app scrive una sezione in Markdown pronta per `CHANGELOG.md` nella cartella del progetto, o la copia negli appunti; con il repository collegato propone anche il tag git `v1.3` (comando da copiare, non eseguito).

**Campi nuovi.** `milestones: [{id, name, dueDate, closedAt}]` sul progetto; `milestoneId` sul task.

**Perché non è scontata.** Le note di versione sono il lavoro noioso che si fa *dopo* il lavoro vero; qui escono gratis da dati già inseriti. Il repository di Todo Doto stesso mantiene un `CHANGELOG.md` a mano: è il caso d'uso.

**Punti di forza.** Lega task, commit e rilascio in un'unica catena: la storia di "cosa c'è nella 1.3" è ricostruibile a posteriori. Nel Gantt le tappe sono rombi; A2 può prevedere la data di ogni tappa.

**Impatto tecnico.** Due campi, un selettore nel dettaglio, filtro per tappa nella lista, generatore di Markdown puro (testabile).

**Piano.** Team. La generazione delle note con narrazione IA segue il piano della funzione.

### G3 · Automazioni locali ("se… allora…")

**Cosa fa.** Regole semplici impostate dall'amministratore, eseguite dal PC che rileva la condizione, senza server:
- se un task diventa Confermato senza scadenza → chiedi la scadenza a chi lo conferma;
- se un task "immediata" resta non assegnato per 1 giorno → notifica agli amministratori;
- se tutti i task di una tappa sono completati → segna la tappa chiusa e proponi le note di versione;
- se una domanda resta senza risposta 5 giorni → notifica a chi è stato menzionato;
- se un task completato ha l'etichetta "Bug" → sposta nel contenitore "Da verificare" (vedi sotto).

Le regole sono un elenco chiuso di condizioni e azioni (menu a scelta, non un linguaggio): poche, chiare, senza effetti su file esterni.

**File nuovo.** `rules.json` nel workspace; `ruleRuns` con chiave di deduplica per non eseguire due volte da due PC (stessa logica delle notifiche).

**Perché non è scontata.** Le automazioni esistono in Trello e Jira *perché hanno un server*; farle in locale, in modo deterministico e deduplicato, è un vantaggio tecnico raro e un buon argomento ("funziona anche in una LAN chiusa").

**Punti di forza.** Riduce il lavoro di supervisione dell'amministratore. Rende A3 proattivo invece che consultivo.

**Impatto tecnico.** Medio: motore di regole puro, esecuzione nel ciclo di aggiornamento live (`stores/workspace.ts`), interfaccia a elenco. Ogni regola è un test unitario.

**Piano.** Business.

### G4 · Assenze e riassegnazione suggerita

**Cosa fa.** Ogni utente indica i periodi di assenza (ferie, trasferta). L'app segnala, nel dialog di assegnazione e in A5, "Mario è assente dal 4 all'8 novembre"; nel pannello Attenzioni elenca i task in scadenza durante un'assenza e propone a chi passarli (chi ha meno carico, PC pronto, stessa etichetta già lavorata).

**Campo nuovo.** `absences: [{from, to, note}]` nell'utente (`users.json`).

**Perché non è scontata.** Nei team piccoli le ferie sono la prima causa di ritardo e nessun todo le conosce.

**Punti di forza.** Pochi dati, molto effetto; combina A5, A6 e la riassegnazione già esistente.

**Piano.** Team.

### G5 · Attività git per task (branch e commit, non solo chiusure)

**Cosa fa.** Oggi un commit "chiude TODO-12" completa il task. In più:
- nel dettaglio del task, una linea del tempo dei commit che *citano* TODO-12 senza chiuderlo (lavoro in corso), presi dal reflog già letto;
- "Crea branch" dal task: copia negli appunti `git switch -c todo-12-esportazione-csv` (o lo esegue nella cartella del progetto, dopo conferma);
- i commit su un branch `todo-12-*` contano come lavoro sul task anche senza citarlo nel messaggio;
- nella lista, un'icona "in lavorazione" sui task con commit negli ultimi 3 giorni.

**Perché non è scontata.** La maggior parte dei tool collega git tramite servizi cloud (GitHub app). Qui si legge il repository locale: funziona con qualsiasi remoto, anche senza remoto.

**Punti di forza.** Lo stato "in corso" si deduce dal codice, non lo deve aggiornare nessuno. Estende `gitLink.ts` e `git.rs` senza nuovi permessi.

**Impatto tecnico.** Estensione di `parseReflog`/`planGitClose` con il nome del branch; campo `activity` calcolato, non salvato.

**Piano.** Free: è la funzione da far provare al singolo sviluppatore, quello che poi porta l'app in ufficio.

### G6 · Registro delle decisioni

**Cosa fa.** Quando si risolve una domanda, chi la chiude può segnare la risposta scelta come **decisione** con una riga di motivazione. Il progetto ha una scheda "Decisioni" cronologica e cercabile; nel rapporto di stato (A7) le decisioni del periodo compaiono in automatico; nel documento di architettura (Stack › doc) si può "aggiungere al documento" con un click.

**Campo nuovo.** `decision: {answerId, rationale, at, by} | null` sulla domanda.

**Perché non è scontata.** La domanda "perché abbiamo fatto così?" dopo sei mesi non ha risposta in nessun todo; le domande con risposte di Todo Doto sono già il posto giusto, manca solo il segno.

**Punti di forza.** Costo minimo, valore che cresce col tempo. Dà un uso in più alla funzione Domande.

**Piano.** Free.

### G7 · Modelli di progetto e liste di controllo ricorrenti

**Cosa fa.** Si salva un progetto come modello (Stack, cartelle allegati, etichette, task iniziali con scadenze relative "T+7 giorni") e si creano nuovi progetti da lì. Dentro un progetto, un task può essere una **lista di controllo ripetibile** (es. "Checklist di rilascio": 9 voci) che si "ripete" creando una copia pulita con le voci da spuntare, legata alla tappa.

**Campi nuovi.** `templates/<id>.json` nel workspace; `checklist: [{text, done}]` sul task; `recurrence: {every: 'week'|'month'|'manual'}`.

**Perché non è scontata.** Le liste di controllo sì, i modelli con lo Stack e le scadenze relative no: l'onboarding di un progetto nuovo in un ufficio IT è sempre uguale (repo, prerequisiti, variabili, primi task) e oggi si rifà a mano.

**Punti di forza.** Si lega alla configurazione guidata e ai file iniziali (`TemplateFile`) già esistenti: il modello crea sia il progetto in Todo Doto sia la cartella sul disco.

**Piano.** Free il modello personale (workspace locale); Team i modelli condivisi del workspace di rete e le liste ricorrenti.

### Contenitore "Da verificare" (piccolo, ma utile)

Oggi i contenitori sono Da fare → Completati. Un quarto contenitore facoltativo per progetto, **Da verificare**, fra i due, per chi vuole che un altro collega confermi il lavoro (tipico per i bug). Si attiva per progetto; chi non lo attiva non lo vede. Campo `review` nel `BUCKETS`, con regola: il completamento definitivo lo fa chi non ha fatto il lavoro. **Free.**

---

## 4. Semplificazione: meno click, più ordine

### S1 · Inserimento rapido in linguaggio naturale (senza IA)

**Cosa fa.** Nella casella "nuovo task" si scrive `Esportazione CSV !alta @mario #bug entro venerdì v1.3` e l'app compila priorità, assegnatario, etichetta, scadenza e tappa in modo deterministico, mostrando i campi riconosciuti come chip prima di confermare. Con l'IA attiva, dalle frasi libere ("per fine mese", "urgente") si propone la stessa cosa.

**Perché non è scontata.** Il dialog con sei campi è il motivo per cui la gente tiene i task in un file di testo. Il parser è una funzione pura di 100 righe, con test.

**Punti di forza.** Vale per tutti i piani, si vede nel primo minuto di prova, costa pochissimo.

**Piano.** Free.

### S2 · Vista "Oggi" personale e rinvio ("rivedi tra…")

**Cosa fa.** Una pagina del workspace, per utente, con tutto ciò che riguarda *me* in tutti i progetti: in ritardo, scadono oggi/questa settimana, "immediata", domande rivolte a me o in cui sono menzionato senza risposta, task sbloccati (G1), task di cui sono assegnatario senza scadenza. Da ogni riga si agisce senza aprire il progetto. Un task si può **rinviare** ("rivedi lunedì"): sparisce dalla vista personale fino a quella data senza cambiare la scadenza (scelta personale, salvata nel PC, non nel workspace).

**Perché non è scontata.** La home attuale è del workspace; le notifiche sono eventi. Manca la vista "cosa devo fare io, adesso", che è quella che si apre al mattino. Il rinvio personale, separato dalla scadenza condivisa, è raro ed evita il vizio di spostare le scadenze per far sparire i task.

**Punti di forza.** Aumenta l'uso quotidiano (la metrica che conta per il rinnovo). Riusa filtri e notifiche.

**Impatto tecnico.** Vista nuova; `snoozed: {itemId: date}` in `config.json` locale.

**Piano.** Free.

### S3 · Calendario delle scadenze per Outlook/Google (`.ics` sulla condivisione)

**Cosa fa.** L'app mantiene nella cartella del workspace un file `calendario/<utente>.ics` (e uno per progetto) con le scadenze e le tappe, aggiornato a ogni salvataggio. Outlook, Thunderbird e Google Calendar lo aprono come calendario in sola lettura da percorso di rete: le scadenze appaiono accanto alle riunioni, senza server e senza account.

**Perché non è scontata.** Le integrazioni calendario di solito passano da un'API cloud. Un file `.ics` su una share è banale e perfettamente coerente con la filosofia del prodotto.

**Punti di forza.** Visibilità delle scadenze anche per chi non apre l'app ogni giorno (capi, commerciali). Generatore puro, testabile.

**Piano.** Free il file personale nel workspace locale; Team i calendari condivisi per progetto e per utente in rete.

### S4 · Archivio automatico e "Pulizia guidata"

**Cosa fa.**
- **Archivio**: i task completati da più di N giorni (predefinito 90) passano in `archive/<progetto>.json`: la lista resta corta, il file di progetto piccolo e veloce da sincronizzare in rete, la ricerca li trova comunque ("Mostra archiviati").
- **Pulizia guidata** (per amministratori): un controllo che elenca allegati con percorso non più esistente, link che non rispondono, etichette mai usate, progetti senza attività da 60 giorni (proposta: archivia o cestina), utenti che non entrano da 90 giorni, cartelle vuote. Ogni voce ha l'azione accanto; nulla si fa in automatico.

**Perché non è scontata.** I todo crescono finché diventano inutilizzabili; nessuno aggiunge mai la funzione "togli il vecchio". La pulizia guidata è il "dottore" che i workspace di rete condivisi fra 10 persone non hanno.

**Punti di forza.** Migliora le prestazioni (un file di progetto con 2.000 task completati pesa sulla rete) ed evita la sensazione di disordine che fa abbandonare lo strumento.

**Piano.** Free l'archivio; Team la pulizia guidata (ha senso soprattutto nei workspace condivisi).

### S5 · Palette dei comandi (Ctrl+K)

**Cosa fa.** La ricerca globale esistente diventa anche palette: "vai al progetto…", "nuovo task in…", "assegna a…", "apri Analisi", "genera rapporto di stato", con i tasti rapidi accanto. Unisce ricerca per testo, ricerca per significato (IA, già esistente) e azioni.

**Piano.** Free. Costo basso: estensione di `GlobalSearch.vue`.

---

## 5. IA locale: il moltiplicatore

L'IA gira sul PC dell'utente, gratis e senza connessioni esterne: è un vantaggio che va **tenuto in tutti i piani** come leva di adozione. La regola proposta: una funzione assistita dall'IA segue il piano della funzione che potenzia (il rapporto di stato narrato è Team perché il rapporto è Team), con una sola eccezione, I1, che è una funzione a sé.

### I1 · "Chiedi al progetto"

**Cosa fa.** Una casella di domande sul progetto: "cosa abbiamo deciso sull'autenticazione?", "chi ha lavorato all'export e cosa manca?", "quali prerequisiti servono per avviare il backend?". L'app cerca per significato (embedding già usati per task simili) fra task, commenti, domande e decisioni, documento di architettura, note dello Stack, allegati testuali (`.md`, `.txt`, PDF con testo) e passa al modello solo i passaggi trovati; la risposta cita le fonti (task TODO-12, decisione del 3 ottobre, `ARCHITETTURA.md` §4) ed è cliccabile.

**Perché non è scontata.** È la ricerca che risponde invece di elencare, con i dati che restano sul PC. Per un'azienda che non vuole il cloud è l'unico modo per avere "un assistente sul progetto".

**Punti di forza.** Riusa `nearest()` di `aiAssist.ts`, l'indice degli embedding e il lettore di allegati (`preview.ts`). I limiti sono già noti (nessun segreto al modello, come per "Rileva dai file").

**Impatto tecnico.** Medio-alto: indice degli embedding persistente per PC (`%APPDATA%`), estrazione testo dai PDF, dialog con risposta e citazioni.

**Piano.** Business.

### I2 · Nota di passaggio alla riassegnazione

Quando un task cambia assegnatario, l'IA propone un riassunto per chi lo riceve (cosa è stato fatto, cosa è aperto, commit collegati, domande senza risposta), da rivedere e incollare come commento. Riusa i dati del task; nessun nuovo file. **Team** (riassegnazione fra colleghi).

### I3 · "Perché è in ritardo" e narrazione del rapporto

Sul task in ritardo: spiegazione a partire dai fatti (bloccato da TODO-7 ancora aperto, riassegnato due volte, domanda senza risposta da 9 giorni). È la versione per task del rapporto di stato. **Segue A7.**

### I4 · Etichetta e priorità suggerite

Al salvataggio di un nuovo task, chip "Bug? · Alta?" ricavati dai task simili già etichettati (gli embedding esistono). Si accetta con un click, mai in automatico. **Free.**

---

## 6. Dove collocarle nei piani a pagamento

### 6.0 Prima domanda: reintrodurre un piano a pagamento?

Oggi l'app è gratuita e tutto ciò che fa è di tutti. Tre regole valgono comunque:

- **Nulla di ciò che oggi è gratuito diventa a pagamento.** Togliere una funzione a chi la usa costa più fiducia di quanto renda.
- **Le funzioni nuove si possono collocare in un piano**, perché nessuno le ha ancora.
- **Il gratuito resta generoso**: è ciò che ha deciso la 0.3.0 e il motivo per cui l'app si diffonde.

**Raccomandazione: un solo piano a pagamento, «Business», introdotto con la terza ondata (§7).** Le funzioni delle colonne Free e Team della tabella §6.2 restano gratuite per tutti. Solo le quattro funzioni da direzione (A2 previsione, G3 automazioni, A8 confronto fra date, I1 «Chiedi al progetto») formano il piano Business, a 149,90 €/anno per workspace come nel piano di lancio. Le donazioni restano per chi usa solo la parte gratuita.

Perché un piano solo: è facile da spiegare («gratis per lavorare, Business per decidere»), non obbliga a reintrodurre limiti sul numero di utenti, e il codice delle licenze del ramo `lavoro-lancio-2026-10-15` serve solo per un controllo («Business sì o no»).

**Alternativa**, se si vuole tornare ai tre piani del piano di lancio: si applica la tabella §6.2 così com'è, con Team a 49,90 €/anno. È più redditizia sulla carta ma contraddice il messaggio «Todo Doto è gratuito» appena pubblicato.

La tabella che segue indica comunque dove starebbe ogni funzione in un modello a tre piani, così la scelta resta aperta.

### 6.1 Principi (in continuità con PIANO-LANCIO §5)

1. **Free resta utile per sempre a una persona sola** e deve far dire "wow" al singolo sviluppatore nel primo giorno: inserimento rapido, vista Oggi, git per task, decisioni, archivio, IA personale.
2. **Si paga la collaborazione e la visione d'insieme**: tutto ciò che confronta persone, progetti o PC (A4, A5, A6, G1, G4, modelli condivisi, calendari di rete, pulizia guidata) è Team.
3. **Business paga la decisione e la memoria**: previsione (A2), automazioni (G3), confronto fra date (A8), "Chiedi al progetto" (I1). Sono le funzioni che un titolare o un responsabile IT riconosce come "strumento di direzione", non di squadra.
4. **L'IA locale non è un piano**: non si vende "l'IA", si vende ciò che fa. Evita anche l'obiezione "pago per una cosa che gira sul mio PC".
5. **Nessun dato si blocca mai**: come oggi, a licenza scaduta le funzioni a pagamento si disattivano ma i campi (dipendenze, tappe, stime) restano leggibili e visibili in sola lettura.

### 6.2 Tabella riassuntiva

Sforzo: S = 1–3 giorni, M = 1–2 settimane, L = 2–4 settimane. Impatto: quanto cambia la giornata di chi usa l'app.

| # | Funzione | Area | Impatto | Sforzo | Free | Team | Business |
|---|---|---|---|---|---|---|---|
| S1 | Inserimento rapido in linguaggio naturale | Semplif. | Alto | S | ✓ | ✓ | ✓ |
| S2 | Vista Oggi personale e rinvio | Semplif. | Alto | M | ✓ | ✓ | ✓ |
| G5 | Attività git per task (branch, commit in corso) | Gestione | Alto | M | ✓ | ✓ | ✓ |
| G6 | Registro delle decisioni | Gestione | Medio | S | ✓ | ✓ | ✓ |
| S4 | Archivio automatico | Semplif. | Medio | S | ✓ | ✓ | ✓ |
| S4 | Pulizia guidata | Semplif. | Medio | M | — | ✓ | ✓ |
| S5 | Palette dei comandi | Semplif. | Medio | S | ✓ | ✓ | ✓ |
| — | Contenitore "Da verificare" | Gestione | Medio | S | ✓ | ✓ | ✓ |
| I4 | Etichetta e priorità suggerite (IA) | IA | Medio | S | ✓ | ✓ | ✓ |
| A1 | Tempi di ciclo e invecchiamento | Analisi | Alto | M | progetto | workspace | workspace |
| A3 | Segnali di stallo (Attenzioni) | Analisi | Alto | M | progetto | workspace | workspace |
| A7 | Rapporto di stato | Analisi | Alto | M | testo | ✓ + PDF | ✓ + PDF |
| S3 | Calendario .ics | Semplif. | Medio | S | locale | rete | rete |
| G7 | Modelli di progetto e liste ricorrenti | Gestione | Medio | M | personali | condivisi | condivisi |
| G1 | Dipendenze e Gantt con catene | Gestione | Alto | M | — | ✓ | ✓ |
| G2 | Tappe e note di versione | Gestione | Alto | M | — | ✓ | ✓ |
| A4 | Semaforo di salute | Analisi | Medio | M | — | ✓ | ✓ |
| A5 | Calendario del carico e collisioni | Analisi | Alto | M | — | ✓ | ✓ |
| A6 | Matrice readiness × progetto | Gestione | Medio | S | — | ✓ | ✓ |
| G4 | Assenze e riassegnazione | Gestione | Medio | S | — | ✓ | ✓ |
| I2 | Nota di passaggio (IA) | IA | Medio | S | — | ✓ | ✓ |
| A2 | Previsione di consegna | Analisi | Alto | M | — | — | ✓ |
| G3 | Automazioni locali | Gestione | Alto | L | — | — | ✓ |
| A8 | Cosa è cambiato tra due date | Analisi | Medio | M | — | — | ✓ |
| I1 | "Chiedi al progetto" (IA) | IA | Alto | L | — | — | ✓ |

### 6.3 Come cambia la tabella dei piani sul sito

Righe da aggiungere alla tabella di `PIANO-LANCIO.md` §5.2 (e a `Web/`), con la stessa impostazione:

| | Free | Team | Business |
|---|---|---|---|
| Inserimento rapido, vista Oggi, git per task, decisioni, archivio | ✓ | ✓ | ✓ |
| Tempi di ciclo, segnali di stallo, rapporto di stato | per progetto | tutto il workspace, PDF | tutto il workspace, PDF |
| Dipendenze, tappe e note di versione | — | ✓ | ✓ |
| Carico per persona, collisioni, assenze, PC pronti | — | ✓ | ✓ |
| Modelli condivisi, calendari di rete, pulizia guidata | — | ✓ | ✓ |
| Previsione di consegna | — | — | ✓ |
| Automazioni locali | — | — | ✓ |
| Confronto fra due date (dalle copie di sicurezza) | — | — | ✓ |
| "Chiedi al progetto" (IA locale) | — | — | ✓ |

Il prezzo non cambia: Team 49,90 €/anno, Business 149,90 €/anno. Le nuove funzioni Business rendono credibile il triplo di prezzo rispetto a Team, che oggi è giustificato quasi solo da "utenti illimitati" e supporto.

**Prerequisito.** Il controllo dei piani (`services/license.ts`, `PlanBanner.vue`, i riquadri "disponibile nel piano") è nel ramo `lavoro-lancio-2026-10-15` e non in `main`, che dalla 0.3.0 ha sospeso licenze e abbonamenti. Con la raccomandazione §6.0 basta portarne la verifica della licenza e un solo controllo «Business», solo quando parte la terza ondata. Con il modello a tre piani va portato tutto prima della seconda ondata.

---

## 7. Ordine di realizzazione proposto

Tre ondate, ognuna rilasciabile da sola. Dentro ogni ondata le funzioni sono indipendenti e si possono fare in parallelo o in un ordine diverso.

### Ondata 1 · "Si vede nel primo giorno" (Free, 3–4 settimane)

Obiettivo: uso quotidiano e passaparola fra sviluppatori.

1. S1 inserimento rapido · 2. S2 vista Oggi e rinvio · 3. G5 attività git per task · 4. G6 decisioni · 5. S4 archivio · 6. S5 palette · 7. A3 segnali di stallo nel progetto · 8. A1 tempi di ciclo nel progetto.

Nessun controllo di piano: si può fare subito.

**Stato: fatta nella 0.5.0** (dettagli in `Desktop/PROGETTO.md` §9h). Differenze rispetto a quanto descritto sopra:

- **S4 archivio**: i completati vecchi stanno da parte nella lista «Completati», ma restano nel file del progetto. Con i capitoli della 0.4.0 il problema di prestazioni non c'è più, e un file `archive/` separato avrebbe complicato unione fuori ufficio, copie e capitoli. La **pulizia guidata** resta nell'ondata 2.
- **A3 segnali**: «assegnato a chi non apre il workspace da 14 giorni» richiede di registrare l'ultimo accesso di ogni utente, che oggi non c'è; al suo posto c'è «assegnato a un utente non più nel workspace». «In ritardo con altri 5 in ritardo» è sostituito dall'ordine per gravità e priorità.
- **G5 git**: il branch si copia (nome o comando), non si crea dall'app; l'app continua a non eseguire git per conto dell'utente. I commit di un branch `todo-n-*` che non citano il codice non si contano: servirebbe eseguire git per sapere da dove parte il branch.
- **S2 Oggi**: non è ancora selezionabile come pagina iniziale.

### Ondata 2 · "La squadra" (4–6 settimane)

Obiettivo: le funzioni di coordinamento per i workspace di rete. Con la raccomandazione §6.0 restano gratuite e non richiedono il codice delle licenze; con il modello a tre piani sono il contenuto del piano Team.

1. G1 dipendenze · 2. G2 tappe e note di versione · 3. A7 rapporto di stato con PDF · 4. A5 calendario del carico (con stime facoltative) · 5. A6 matrice readiness · 6. G4 assenze · 7. A4 semaforo di salute · 8. S3 calendari di rete · 9. G7 modelli condivisi · 10. pulizia guidata · 11. I2 nota di passaggio.

**Stato: fatta nella 0.6.0** (dettagli in `Desktop/PROGETTO.md` §9i). Differenze rispetto a quanto descritto sopra:

- **G2 tappe**: il tag git della versione si propone come comando da copiare; l'app non esegue git.
- **A5 carico**: la griglia sta in Analisi, quindi la vedono gli amministratori. Senza ore settimanali indicate il carico si conta in scadenze (oltre 5 a settimana è troppo).
- **A7 rapporto**: «Invia per email» apre il programma di posta con il testo; l'invio diretto con Outlook o SMTP resta, per ora, solo della roadmap per il cliente.
- **S3 calendari**: i file stanno nella cartella Dati e si aprono da percorso (Outlook, Thunderbird); Google Calendar li importa ma non li aggiorna. Con i dati cifrati non si creano.
- **G7 modelli e liste**: la ripetizione nasce al completamento (dalla lista o dal dettaglio), non a calendario; un task chiuso da un commit non crea il successivo. I modelli li salvano gli amministratori.
- **Pulizia guidata**: manca «utenti che non entrano da 90 giorni», per lo stesso motivo dell'ondata 1 (l'ultimo accesso non si registra).
- **I2 nota di passaggio**: compare dopo il cambio di assegnatario dal dettaglio del task, non dalla riassegnazione nella griglia del carico.

### Ondata 3 · "Business" (5–7 settimane, con la verifica della licenza)

1. A2 previsione (usa A5) · 2. G3 automazioni (usa G1, G2, A3) · 3. A8 confronto fra date · 4. I1 "Chiedi al progetto".

**Stato: fatta in parte nella 0.7.0** (dettagli in `Desktop/PROGETTO.md` §9j), senza piano a pagamento: le funzioni fatte restano gratuite e non serve il codice delle licenze. Differenze rispetto a quanto descritto sopra:

- **A2 previsione**: non fatta.
- **G3 automazioni**: solo tre regole (urgente senza responsabile → amministratori; domanda senza risposta → menzionati; confermato senza scadenza → l'app chiede la data). Niente `rules.json` né `ruleRuns`: ogni PC valuta le regole per chi lo usa e le notifiche hanno una chiave fissa, quindi non serve decidere quale PC le esegue. L'età del task urgente si conta dalla creazione (il momento in cui è diventato urgente o è rimasto senza responsabile non si registra).
- **A8 confronto fra date**: tra copie di sicurezza o con adesso; le date sono quelle delle copie esistenti (7 giornaliere e 4 settimanali), non un giorno qualsiasi.
- **I1 «Chiedi al progetto»**: gli allegati di Google Drive e le scansioni dei PDF (senza testo) non si leggono; l'indice non si salva se i dati del workspace sono cifrati.

### Dipendenze fra funzioni

- A2 previsione ← A5 stime (facoltativo ma migliora molto).
- G3 automazioni ← G1, G2, A3 (le condizioni delle regole).
- A4 salute ← A3, readiness.
- A7 rapporto ← G6 decisioni, G2 tappe (per le sezioni "decisioni" e "prossime tappe").
- I1 ← indice degli embedding persistente (oggi è solo in memoria: `vectors` in `aiAssist.ts`).

---

## 8. Punti di forza complessivi del piano

- **Quasi tutto si calcola da dati già presenti.** Solo cinque campi nuovi facoltativi (`blockedBy`, `milestoneId`, `estimateHours`, `decision`, `absences`) e tre file nuovi (`health.json`, `rules.json`, `archive/`). Nessuna migrazione: zod con default.
- **Coerente con la promessa "zero server".** Automazioni, calendari, confronto fra date e assistente IA funzionano in una LAN chiusa: nessun concorrente cloud può copiarlo con lo stesso argomento.
- **Rafforza il tratto distintivo.** Git per task, PC pronti, note di versione, modelli con Stack: sono funzioni che Trello, Planner ed Excel non hanno e che un ufficio IT riconosce al volo.
- **Una scala di valore chiara.** Free = la mia giornata; Team = la squadra; Business = la direzione. La tabella dei piani si spiega in una frase ciascuna.
- **Costo contenuto.** La maggior parte delle funzioni sono servizi puri testabili con vitest, nello stile del codice attuale (`analytics.ts`, `gantt.ts`, `gitLink.ts`); l'interfaccia riusa i componenti esistenti.

## 9. Rischi e scelte da fare

- **Troppe funzioni rovinano la semplicità**, che è un valore del prodotto (PIANO-LANCIO §2: "semplifica tutto"). Rimedio: ogni funzione di Analisi e Gestione compare solo quando ha dati (niente card vuote), le automazioni e le stime sono spente finché un amministratore non le accende, la vista Oggi è la pagina iniziale solo se l'utente lo sceglie.
- **Stime in ore**: rischio di diventare "controllo dei tempi" e di essere rifiutate dal team. Rimedio: sempre facoltative, mai per persona in Analisi (solo per progetto e per settimana), nessun confronto stimato/effettivo nella prima versione.
- **Automazioni su più PC**: due PC potrebbero valutare la stessa regola nello stesso istante. Rimedio: la stessa chiave di deduplica delle notifiche e la regola "esegue il PC che ha scritto l'ultima versione del progetto".
- **Indice IA persistente**: occupa spazio e va invalidato quando i task cambiano. Rimedio: indice per PC in `%APPDATA%`, chiave = hash del testo, ricostruzione pigra.
- **Scelta aperta**: se portare il rapporto di stato in testo nel Free (come assaggio della versione PDF Team) o tenerlo tutto in Team. Proposta: testo in Free, perché genera il "fammi vedere" dal capo che porta all'acquisto.
- **Scelta aperta**: contenitore "Da verificare" come quarto contenitore o come stato. Proposta: contenitore, perché gli stati oggi descrivono la *decisione* (da valutare → confermato) e non l'*avanzamento*.
