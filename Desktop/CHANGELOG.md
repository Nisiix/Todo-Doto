# Novità

Il file è letto dal sito (pagina «Novità», `Web/changelog.html`). Formato: un titolo `## <versione> — <data>` per release, poi un elenco puntato.

## 0.5.0 — 20 ottobre 2026

- Inserimento rapido: sopra la lista si scrive «Esportazione CSV !alta @mario #bug entro venerdì» e Invio crea il task con priorità, assegnatario, etichetta e scadenza. Ciò che è riconosciuto si vede prima; la X lo lascia nel titolo. Funziona anche nel dialog «Nuovo task».
- Oggi: una pagina con quello che riguarda te in tutti i progetti (in ritardo, in scadenza oggi e in settimana, urgenti, domande che aspettano una tua risposta, risposte alle tue domande). Si completa e si rinvia senza aprire il progetto; il rinvio vale solo per te e non cambia la scadenza.
- Decisioni: in una domanda, la risposta scelta diventa «la decisione», con la motivazione. Il progetto ha il suo registro delle decisioni, con ricerca e copia in Markdown.
- Attenzioni e tempi: nel progetto, l'elenco di ciò che sta andando storto senza che nessuno l'abbia segnalato (ritardi, urgenze senza nessuno, domande senza risposta, task fermi) e i tempi mediani da creato a confermato e a completato, con l'età dei task da fare.
- Git per task: nel dettaglio, i commit che citano TODO-n e il nome del branch da copiare; il task risulta «in lavorazione» con commit recenti o con il suo branch aperto sul PC.
- Archivio: i completati da più di 90 giorni stanno in fondo a «Completati», dietro «Mostra archiviati». La ricerca li trova sempre.
- Palette dei comandi: in Ctrl+K, «>» mostra i comandi (Oggi, nuovo task, decisioni, attenzioni, sezioni del progetto, impostazioni…) e «+» aggiunge un task al progetto aperto.

## 0.4.0 — 20 ottobre 2026

- VPN dell'ufficio dalle impostazioni: si sceglie una VPN già configurata in Windows e Todo Doto la collega da sola quando la cartella condivisa non risponde (anche all'apertura). Le credenziali restano a Windows.
- Accesso aziendale: con l'account di dominio (Active Directory o Microsoft Entra ID) la stessa persona è lo stesso utente su qualunque PC; i ruoli si possono ricavare dai gruppi di Active Directory.
- Email e Teams: «Invia per email» su task, roadmap e riepilogo; canale Microsoft Teams per progetto con task creati, completati, assegnazioni, domande e menzioni; email a chi viene menzionato o riceve un task; il punto della giornata ogni mattina. Invio con Outlook del PC o con il server SMTP aziendale; tutto facoltativo e scelto dall'amministratore.
- Pensato per team più grandi: cronologia in file per mese e per PC (niente più file unico riscritto da tutti), giornale delle modifiche per sapere quali file rileggere, controllo della cartella meno frequente con la finestra in secondo piano o lontani dal PC, progetti con centinaia di task divisi in capitoli.

## 0.3.0 — 20 ottobre 2026

- Todo Doto è gratuito: licenze e abbonamenti sono sospesi. Chi vuole può sostenere lo sviluppo con una donazione PayPal (Impostazioni › Generali e sito).
- Chi lavora a cosa: nel dettaglio del task «Ci sto lavorando»; nella lista una pastiglia verde con chi ci lavora, senza spostare le colonne; nella nuova Panoramica l'elenco di tutto il team.
- Roadmap per il cliente: una pagina con cosa è fatto e cosa arriva, senza descrizioni, commenti o dettagli interni, da mandare o stampare in PDF.
- Configura questo PC: in un solo passaggio i programmi che servono a tutti i tuoi progetti, ognuno installato una volta sola.
- Stack non aggiornato: se i file del progetto cambiano (es. una nuova versione di Node.js), un avviso propone di aggiornare lo Stack con un clic.
- Portatile fuori ufficio: senza la cartella condivisa si continua a lavorare sulla copia del PC; al ritorno le modifiche si uniscono a quelle dei colleghi, campo per campo, e i conflitti si mostrano.
- Cifratura dei dati sul disco per i workspace di rete (Impostazioni › Dati utente, amministratori): file, copie di sicurezza e copia fuori ufficio illeggibili senza la password.
- Rilevamento dei cambiamenti più leggero sulle cartelle di rete: si interrogano solo le cartelle cambiate.

## 0.2.26 — 16 ottobre 2026

- IA locale, gratuita e tutta sul PC (Ollama con Qwen 3 4B, o un server compatibile OpenAI come LM Studio): l'app comunica solo con il motore installato sul PC, mai con servizi esterni.
- Impostazioni › IA locale: prova di connessione e download dei modelli con barra di avanzamento. Nell'installer per Windows, opzione facoltativa per installare anche l'IA.
- Stack: "Rileva dai file del progetto" con l'IA attiva propone anche prerequisiti, passi, variabili e note che i file non dicono esplicitamente, da scegliere prima di aggiungerli.
- Funzioni assistite: "Come risolvere" per i prerequisiti, task da un testo, avviso dei task simili, ricerca per significato, commit che potrebbero completare un task, riepilogo della settimana, AGENTS.md/CLAUDE.md dallo Stack.
- Un banner in alto invita ad attivare l'IA locale; chiuso, non ricompare.

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
