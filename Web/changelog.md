# Novità

Il file è letto dal sito (pagina «Novità», `Web/changelog.html`). Formato: un titolo `## <versione> — <data>` per release, poi un elenco puntato.

## 0.2.30 — 16 ottobre 2026

- Stack: «Apri nell'editor» è l'operazione conclusiva, con un pulsante che apre il progetto nell'editor indicato (es. la soluzione in Visual Studio), non più un passo da spuntare. «Gestisci configurazione automatica» compare solo se ci sono passi da fare; tolto «Ricomincia».
- Prerequisiti: il .NET Framework si richiede anche senza i file del progetto (es. progetti Visual Basic Express 2010); Git anche quando un passo usa git; i prerequisiti mancanti si propongono da aggiungere. Nuove verifiche per Visual FoxPro 9 e PowerBuilder; Java, Go e CMake si trovano anche fuori dal PATH.

## 0.2.29 — 16 ottobre 2026

- GitHub nei workspace di rete: il token lo imposta solo un amministratore; cleaner e membri non vedono il pulsante e trovano già gli Stack sincronizzati.
- Google Drive: il client Google lo configura un amministratore per tutto il workspace, gli altri collegano solo il proprio account. Chiunque può risincronizzare e vede i file a cui ha accesso, senza cambiare cosa vedono gli altri; scegliere o togliere la cartella resta dell'amministratore.

## 0.2.28 — 16 ottobre 2026

- Condivisione solo in rete: un workspace si condivide solo con la cartella Dati e la cartella dei progetti su un'unità di rete, un progetto solo con la sua cartella in rete; altrimenti l'app spiega che è in locale.
- Prerequisiti più precisi anche senza IA: niente .NET SDK né Visual Studio 2022 imposti ai progetti .NET Framework (es. Visual Basic Express 2010); gli stack salvati prima si correggono con un clic, e da soli quando la cartella del progetto è disponibile.
- Configurazione del PC: i programmi mancanti si installano in automatico con winget; per quelli sconosciuti li cerca l'IA locale (o se ne consiglia l'attivazione).

## 0.2.27 — 16 ottobre 2026

- IA locale: spuntando «Usa l'IA locale su questo PC» Ollama si configura da solo. Se manca si installa (scaricato da ollama.com, solo se firmato da Ollama), se è spento si avvia; indirizzo e modelli sono già compilati e la connessione si verifica da sola.
- Con un server compatibile OpenAI si configura a mano e si prova con «Prova connessione».
- Impostazioni: la scheda IA locale viene prima di Notifiche.

## 0.2.26 — 16 ottobre 2026

- IA locale facoltativa (Ollama sul PC, solo 127.0.0.1): analisi dello Stack più precisa e funzioni assistite.

## 0.2.25 — 16 ottobre 2026

- Nella barra laterale le sezioni del progetto sono ora nell'ordine Stack, Todo, Gantt, Allegati.
- Nuovo sito: prezzi dei piani Free, Team e Business, domande frequenti, guida all'uso, note di versione, confronti con Trello ed Excel, pagine legali aggiornate.

## 0.2.24 — 15 ottobre 2026

- Stack: campi non validi impediscono il salvataggio.

## 0.2.23 — 15 ottobre 2026

- "Rileva dai file del progetto" solo con una cartella del progetto valida.

## 0.2.22 — 15 ottobre 2026

- Riapertura dell'ultimo workspace senza passare dalla scelta del workspace.

## 0.2.21 — 15 ottobre 2026

- Cartella del progetto mostrata solo se c'è davvero su questo PC.

## 0.2.20 — 15 ottobre 2026

- Filtri del Gantt, scadenza non impostata, impostazioni con "Dati utente".

## 0.2.19 — 15 ottobre 2026

- Cartella del progetto su questo PC, impostazioni in schede.

## 0.2.18 — 15 ottobre 2026

- Todo Doto: nuovo nome, Gantt dei task confermati, prerequisiti dai file di progetto.

## 0.2.17 — 15 ottobre 2026

- Commit git → task: "chiude TODO-n" completa il task.

## 0.2.16 — 15 ottobre 2026

- Configurazione dei PC condivisa, notifiche gestibili, copie di sicurezza.

## 0.2.15 — 15 ottobre 2026

- Cancellazioni confinate alla cartella Dati, messaggi sui file del progetto.

## 0.2.14 — 14 ottobre 2026

- "Ricorda la password" a scelta, cifrata con Windows DPAPI.

## 0.2.13 — 14 ottobre 2026

- Preferiti nella barra laterale solo se ci sono progetti con la stella.

## 0.2.12 — 14 ottobre 2026

- Link esterni, verifica .NET e prerequisiti fuori dal PATH, campi del task nel dettaglio.

## 0.2.11 — 14 ottobre 2026

- Progetti dalla loro cartella, stack anche da cartelle di rete e sottocartelle, rete più veloce.

## 0.2.10 — 14 ottobre 2026

- Visibilità dei progetti pubblica o limitata, con pallino nella barra laterale.

## 0.2.9 — 14 ottobre 2026

- Cartelle di rete con errori spiegati, cartella creata con il progetto, import dello stack.

## 0.2.8 — 14 ottobre 2026

- Cartella dei progetti ricavata per i workspace creati prima della 0.2.4.

## 0.2.7 — 14 ottobre 2026

- Nome del progetto dalla sua cartella, senza modifica successiva.

## 0.2.6 — 14 ottobre 2026

- Gestione permessi nella pagina Membri, correzione dell'aggiornamento in background.

## 0.2.5 — 14 ottobre 2026

- GitHub, verifica automatica dei prerequisiti, nome e utenti del progetto.

## 0.2.4 — 14 ottobre 2026

- Cartella dei progetti e cartella Dati separate, configurazione automatica.

## 0.2.3 — 14 ottobre 2026

- Workspace da una cartella di progetti esistenti, con creazione automatica dei progetti.

## 0.2.2 — 14 ottobre 2026

- Sezioni del progetto nella barra laterale, Stack con import .md e prerequisiti automatici.

## 0.2.1 — 14 ottobre 2026

- Salvataggi sotto lock fra PC, exe portabile senza installer.

## 0.2.0 — 14 ottobre 2026

- Prima versione pubblicata con build automatica, sito e installer in italiano e in inglese.
