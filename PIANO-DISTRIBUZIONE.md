# Todo Doto — distribuzione gratuita, donazioni e feedback

Verifica del 22 ottobre 2026: cosa c'è già, cosa manca e in che ordine farlo per mettere Todo Doto in mano alle persone gratis, farlo conoscere alla community giusta, ricevere feedback e qualche donazione. Sostituisce le parti di [PIANO-LANCIO.md](./PIANO-LANCIO.md) e [GUIDA-OPERATIVA.md](./GUIDA-OPERATIVA.md) legate alla vendita (Paddle, prezzi, licenze), sospese dalla 0.3.0.

---

## 1. Cosa funziona già

| Area | Stato |
|---|---|
| Download | Repository pubblico; ogni tag `v*` crea una Release con setup `.exe`, `.msi` e portabile, in italiano e in inglese (v0.6.0: sei file) |
| Sito | Online su <https://nisiix.github.io/Todo-Doto/>: presentazione, tre video tutorial, schermate, pulsanti di download che leggono l'ultima Release, Novità, guida, confronti con Trello ed Excel, pagine legali già senza prezzi |
| Donazioni | Pulsante PayPal sul sito e in Impostazioni › Generali |
| Prodotto | 0.7.0 pronta sul ramo di lavoro (non ancora in `main` né rilasciata) |

## 2. Cosa manca, per gravità

### Bloccanti (da sistemare prima di mostrare l'app a chiunque)

1. **Il dominio `projectgoalmanager.app` non esiste.** Non risolve, eppure il sito lo usa per l'indirizzo canonico, i dati strutturati, l'immagine di anteprima (`og:image`) e l'email `supporto@projectgoalmanager.app` (in 10 pagine del sito). Conseguenze: chi scrive al supporto non riceve risposta, e un link condiviso su Reddit, LinkedIn o WhatsApp esce senza immagine. È anche il vecchio nome del prodotto.
   - *Gratis, subito:* usare `nisiix.github.io/Todo-Doto` come indirizzo e un'email che funziona (o rimandare a GitHub Issues).
   - *Meglio, ~15 €/anno:* un dominio con il nome attuale (es. `tododoto.app` o `.it`) + `Web/CNAME` + inoltro email gratuito (Cloudflare Email Routing). Procedura già scritta in GUIDA-OPERATIVA §1.
2. **Nessuna licenza nel repository.** Il codice è pubblico ma senza file `LICENSE`, quindi legalmente «tutti i diritti riservati»: nessuno può contribuire o redistribuire, e le directory open source non lo elencano. Va presa una decisione (vedi §3).
3. **Installer non firmati.** Al primo avvio Windows mostra «PC protetto da Windows»: molti utenti (e quasi tutti gli IT aziendali) si fermano lì. Le strade sono in §3.
4. **Nessun canale di feedback.** Nell'app non c'è «Invia un feedback» né «Segnala un problema»; sul repository mancano i modelli per segnalazioni e idee e le Discussions sono spente; l'email di supporto non funziona (punto 1). Chi prova l'app oggi non ha modo di dire cosa pensa.
5. **0.7.0 non rilasciata.** Unire in `main` e spingere il tag `v0.7.0`.

### Importanti (prima del lancio pubblico)

6. **Nessun aggiornamento automatico.** Chi installa oggi resta sulla sua versione: i feedback arrivano su versioni vecchie e le correzioni non arrivano. L'updater di Tauri c'è già nel ramo `lavoro-lancio-2026-10-15` (va portato, con la chiave di firma degli aggiornamenti nei segreti di GitHub). Minimo indispensabile, mezza giornata: un avviso «È disponibile la versione X» che controlla l'ultima Release su GitHub e apre la pagina di download.
7. **La pagina del repository non presenta il prodotto.** Chi arriva da Hacker News o Reddit atterra spesso su GitHub: oggi trova «Monorepo del progetto», in italiano, senza descrizione, argomenti (topics), sito né immagini. Serve un README in inglese (con un riassunto in italiano): una frase, una schermata o GIF, «Download», funzioni principali, «come funziona senza server», link al sito, alle donazioni e alle Discussions.
8. **Donazioni migliorabili.**
   - Il link PayPal contiene l'email personale (`business=nisos%40live.it`): meglio un pulsante PayPal con ID o un indirizzo PayPal.Me.
   - Aggiungere **GitHub Sponsors** (nessuna commissione sulle donazioni personali) ed eventualmente Ko-fi, con un file `.github/FUNDING.yml`: compare il pulsante «Sponsor» sul repository.
   - Nell'app: un invito discreto a donare dopo qualche settimana d'uso, una volta sola, mai bloccante.
   - Fisco: chiedere al commercialista come trattare le donazioni ricevute da persona fisica (o con partita IVA) prima che diventino regolari.
9. **Documenti interni pubblici.** `PIANO-LANCIO.md`, `GUIDA-OPERATIVA.md` e i piani sono nel repository pubblico, con prezzi, obiettivi di ricavo e un percorso del tuo PC. Non è grave, ma conviene spostarli in un repository privato o almeno togliere ciò che non vuoi mostrare.
10. **winget.** Gratuito: `winget install Todo-Doto` è il canale preferito dagli IT. Si fa dopo la firma (o anche prima, accettando l'avviso). Procedura in GUIDA-OPERATIVA §5, con il nome nuovo.

### Utili (dopo il lancio)

11. Numeri senza tracciare nessuno: i download per Release si leggono dall'API di GitHub (oggi tutti a 0); per il sito, se serve, un contatore rispettoso della privacy (GoatCounter, gratuito per uso non commerciale). L'app resta senza telemetria: è un punto di forza da dichiarare.
12. Elenco su **AlternativeTo** (come alternativa a Trello, Microsoft Planner, Asana), su **Product Hunt** e nelle liste «awesome» di strumenti local-first.

## 3. Le due decisioni da prendere

### Licenza: open source o gratuito chiuso

| | Open source (es. GPL-3.0 o MIT) | Gratuito, codice «visibile ma riservato» |
|---|---|---|
| Firma del codice | **Gratuita** con SignPath Foundation (richiede licenza OSI, build automatica su GitHub, nessun doppio licenziamento commerciale) | A pagamento: certificato OV cloud ~49–130 €/anno (Certum), più i tempi di validazione |
| Community e feedback | Più fiducia (si può verificare che «nessun dato esce dal PC»), contributi, segnalazioni con patch, benvenuto su Hacker News | Feedback sì, contributi no |
| Donazioni | Modello naturale (GitHub Sponsors, Open Collective) | Possibili, ma meno spontanee |
| Piani a pagamento in futuro | Chiusi con SignPath (niente doppio licenziamento); restano servizi o supporto a pagamento | Restano aperti |

**Raccomandazione:** se i piani a pagamento sono davvero accantonati, **open source con GPL-3.0**. Risolve gratis la firma, dà credibilità alla promessa «niente cloud» e si sposa con donazioni e feedback. Se invece vuoi tenerti la strada della vendita, aggiungi comunque un `LICENSE` da «freeware» (uso gratuito, ridistribuzione solo invariata) e metti in conto il certificato OV.

### Firma degli installer

1. **SignPath Foundation** (gratis, solo open source): firma dalla build di GitHub Actions; serve una «code signing policy» sul sito.
2. **Microsoft Store** (registrazione gratuita per sviluppatori individuali da settembre 2025): con il pacchetto MSIX la firma la mette Microsoft e l'app si installa senza avvisi, con aggiornamenti dallo Store. Serve un pacchetto MSIX accanto agli installer attuali (da provare con Tauri).
3. **Certificato OV** (~49–130 €/anno, Certum cloud): l'unica strada per firmare gli `.exe`/`.msi` se il codice resta chiuso. La reputazione su SmartScreen cresce comunque in qualche settimana.

## 4. Piano in quattro passi

### Passo 1 · Pulizia e fondamenta (2–3 giorni, 0–15 €)

- [ ] Rilasciare la 0.7.0 (merge in `main`, tag `v0.7.0`).
- [ ] Decidere la licenza e aggiungere `LICENSE`.
- [x] Email del sito: ora nisos@live.it in tutte le pagine.
- [ ] Indirizzo del sito (canonico, `og:image`, dati strutturati): dominio nuovo o GitHub Pages.
- [x] Modelli per «Segnala un problema», «Proponi un'idea» e «Fai una domanda» (`.github/ISSUE_TEMPLATE`, `.github/DISCUSSION_TEMPLATE`) e `FUNDING.yml`.
- [ ] Repository: descrizione, sito, topics (`project-management`, `roadmap`, `local-first`, `tauri`, `windows`, `offline`, `todo`), README per chi arriva, **Discussions da attivare** (Settings › General › Features › Discussions).
- [x] Nell'app: «Invia un feedback» (problema, idea, domanda su GitHub con versione e sistema già compilati, o email a nisos@live.it); avviso di nuova versione; «Sostieni Todo Doto» nel menu.
- [ ] Donazioni: PayPal senza email nel link, GitHub Sponsors.

### Passo 2 · Fiducia (1–3 settimane)

- [ ] Firma degli installer (SignPath, Store o OV, secondo la licenza).
- [ ] Aggiornamento automatico (updater di Tauri).
- [ ] winget.
- [ ] Pagina «Privacy e sicurezza» semplice: cosa resta sul PC, cosa (non) esce, come verificarlo.

### Passo 3 · Prova con poche persone (2 settimane)

- [ ] 10–20 persone vere: colleghi, studi tecnici, piccole software house, amici IT; meglio uffici con una cartella condivisa (il caso d'uso più forte).
- [ ] A ciascuno un messaggio personale con il link e tre domande: cosa ti ha bloccato nei primi 10 minuti? cosa useresti ogni giorno? cosa manca per usarlo in ufficio?
- [ ] Una chiamata di 20 minuti con 3–5 di loro, guardandoli usare l'app.
- [ ] Correggere i blocchi trovati, rilasciare, chiedere 2–3 frasi da citare (con il permesso).

### Passo 4 · Mostrarlo alla community (una settimana, poi continuo)

| Dove | Come | Angolo |
|---|---|---|
| **Show HN** (Hacker News) | Titolo in inglese, link al repository o al sito; nel primo commento la storia tecnica (sincronizzazione su cartella di rete, scritture atomiche, unione fuori ufficio, IA locale) | Local-first, niente server, codice aperto |
| **Reddit** | r/sysadmin, r/msp, r/smallbusiness, r/productivity, r/selfhosted (con prudenza: non è un server), r/ItalyInformatica; post «ho costruito…» con la storia, il link non in prima riga, rispettando le regole di ogni subreddit | Per uffici con una cartella condivisa |
| **Product Hunt** | Dopo HN/Reddit, con 4–6 immagini e il video di 60 secondi; rispondere a tutti nelle prime ore | Gratis, senza account, con IA locale |
| **AlternativeTo** | Scheda come alternativa a Trello, Planner, Asana, Jira | Offline, gratuito |
| **Italia** | LinkedIn (post personali, non solo link), gruppi e forum di IT per PMI e studi professionali, newsletter italiane di tecnologia | In italiano, per PMI |

- Rispondere a ogni commento e a ogni segnalazione entro un giorno, per le prime settimane.
- Dopo ogni rilascio: una nota breve nelle Discussions e su LinkedIn con «cosa è cambiato grazie a voi», ringraziando chi ha segnalato o donato (se lo vuole).
- Una roadmap pubblica leggera (GitHub Projects o una discussione fissata): «prossimamente», «in valutazione», «non faremo e perché».

## 5. Cosa misurare

| Segnale | Dove | Obiettivo a 3 mesi |
|---|---|---|
| Download per versione | API delle Release di GitHub | 500 |
| Stelle, Discussions, segnalazioni | GitHub | 100 stelle, 30 conversazioni |
| Persone che tornano a scrivere | Discussions, email | 10 utenti «attivi» che rispondono alle domande |
| Donazioni | PayPal, GitHub Sponsors | le prime 10, per capire se il messaggio funziona |

## 6. Cosa posso fare io nel codice

Senza bisogno di account esterni:

- README del repository, `FUNDING.yml`, modelli di segnalazione, `LICENSE` (scelta tua);
- sistemazione degli indirizzi nel sito;
- «Invia un feedback», «Segnala un problema» e avviso di nuova versione nell'app;
- invito discreto alle donazioni;
- updater di Tauri (servono poi i segreti su GitHub);
- workflow per SignPath o per il pacchetto MSIX.

A te restano: la scelta della licenza, eventuale dominio, l'account GitHub Sponsors e PayPal, la richiesta a SignPath o allo Store, il tag della release, i post nelle community.

---

## Fonti

[SignPath Foundation: condizioni](https://signpath.org/terms) · [SignPath per progetti open source](https://about.signpath.io/product/open-source) · [Esempio di code signing policy (Super Productivity)](https://super-productivity.com/code-signing/) · [Microsoft Store gratuito per sviluppatori individuali](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/) · [Microsoft Store: get started (MSIX e firma)](https://learn.microsoft.com/windows/apps/publish/get-started) · [Certum: certificati code signing](https://shop.certum.eu/code-signing.html) · [Confronto certificati economici 2026](https://gabrielmoraru.com/obtaining-cheap-ev-ov-certificates-singing-your-application/)
