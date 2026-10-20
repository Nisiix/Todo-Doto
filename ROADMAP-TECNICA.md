# Roadmap tecnica: VPN, accesso aziendale, email/Teams, team grandi

> **Stato (0.4.0):** fatti la VPN (§1), l'accesso con l'account di dominio e i ruoli dai gruppi (§2, livello 1), tutte le fasi di email e Teams (§3) e i punti 1–5 della tabella del §4. Restano l'SSO con Microsoft Entra ID (§2, livello 2), l'avviso istantaneo nella LAN e il nodo di sincronizzazione (§4, punti 6–7).

Piani per le prossime versioni di Todo Doto (dopo la 0.3.0). Valgono i vincoli di sempre: nessun server da installare, nessun servizio esterno obbligatorio, l'IA solo sul PC, nessuna scrittura nelle cartelle dei progetti senza un'azione dell'utente.

---

## 1. VPN configurabile dalle impostazioni

**Problema.** Chi lavora da casa deve ricordarsi di accendere la VPN prima di aprire Todo Doto; se non lo fa vede «Cartella non raggiungibile». Con la 0.3.0 continua comunque a lavorare sulla copia del PC, ma le modifiche arrivano ai colleghi solo quando torna in rete.

**Soluzione.** Todo Doto non diventa un client VPN: usa le connessioni VPN **già configurate in Windows** (quelle di Impostazioni › Rete › VPN, distribuite di solito dall'IT con Intune/GPO).

| Passo | Dettaglio |
|---|---|
| Impostazioni › Dati utente › «Connessione all'ufficio» | elenco delle VPN di Windows (`Get-VpnConnection`, solo lettura), scelta di una, casella «Collega da solo quando la cartella condivisa non risponde» |
| Collegamento | `rasdial "<nome>"` per le VPN con credenziali salvate in Windows; per le altre si apre il pannello VPN di Windows (`ms-settings:network-vpn`). Mai password VPN in Todo Doto |
| Quando | all'apertura del workspace e quando la cartella cade; al massimo un tentativo ogni 2 minuti, con avviso «Collegamento alla VPN dell'ufficio…» |
| Client di terze parti (FortiClient, GlobalProtect, Cisco) | non hanno un'interfaccia standard: pulsante «Apri il client VPN» con il percorso scelto dall'utente |
| Backend | comando Rust `vpn_list` / `vpn_connect(name)` senza shell, nome validato contro l'elenco restituito da Windows |

Impegno stimato: 2–3 giorni. Nessun permesso di rete nuovo per l'app.

---

## 2. «No company login (Active Directory o SSO)»: cosa significa

Oggi l'utente è riconosciuto da **nome utente di Windows + nome del PC** (`mario@PC-UFFICIO`), e un workspace di rete è protetto da **una password condivisa**. Funziona senza server, ma:

- la stessa persona su due PC diversi risulta come due utenti;
- quando qualcuno lascia l'azienda bisogna cambiare la password del workspace a tutti;
- i ruoli (Amministratore, Cleaner, Membro) si assegnano a mano in Todo Doto, non dai gruppi aziendali;
- non c'è un accesso unico (SSO) con l'account Microsoft 365 / Entra ID.

Le aziende più strutturate lo chiedono per controllo e audit.

**Piano in due livelli.**

1. **Account di dominio (senza server, 3–4 giorni).** Sui PC in dominio Windows conosce già l'utente: si usa `DOMINIO\mario` (SID dell'account) invece di `utente@PC`. Stessa persona su più PC = un solo utente. Facoltativo: ruoli dai gruppi AD (es. gruppo «TodoDoto-Admin» → Amministratore), letti dal token di Windows senza password. La cartella condivisa è già protetta dai permessi NTFS del dominio: la password del workspace diventa facoltativa (resta per la cifratura).
2. **SSO Microsoft Entra ID (più avanti).** Richiede di registrare un'app in Entra e una connessione a Internet al login: in contrasto con «nessun servizio esterno», quindi solo come opzione Business disattivata di default.

---

## 3. Integrazione con email e Microsoft Teams

**Obiettivo.** Le notifiche che oggi si vedono solo dentro l'app arrivano dove le persone già guardano, senza un server di Todo Doto.

| Fase | Cosa | Come | Rete |
|---|---|---|---|
| 1 | **«Invia per email»** su task, roadmap e riepilogo settimanale | `mailto:` precompilato, oppure file `.eml` aperto con Outlook | nessuna |
| 2 | **Teams: canale del progetto** | nello Stack del progetto l'admin incolla l'URL di un *Workflow* di Teams («Pubblica in un canale quando si riceve una richiesta webhook»). Todo Doto invia una scheda (Adaptive Card) quando un task viene completato, assegnato, quando si fa una domanda o si menziona qualcuno | una sola destinazione `https` scelta dall'admin, chiamata dal backend Rust con elenco consentito (solo `*.logic.azure.com`, `*.webhook.office.com`, `*.powerplatform.com`) |
| 3 | **Riepilogo via email** | ogni mattina il PC dell'admin (o un PC scelto) prepara il riepilogo e lo invia con Outlook (automazione COM, solo se Outlook è installato) o via SMTP aziendale configurato in Impostazioni | SMTP interno o Outlook locale |
| 4 | **Menzioni** | `@mario` in un commento → messaggio in Teams o email a Mario, se ha scelto quel canale nelle sue notifiche | come sopra |

Chi invia: il PC di chi compie l'operazione (come oggi per la cronologia). Deduplica con la chiave già usata per le notifiche, così due PC non mandano lo stesso messaggio. Mai inviati: descrizioni, allegati, stack; solo titolo, progetto, chi e cosa.

Tutte le connessioni esterne sono **facoltative, spente di default e configurate dall'amministratore**: senza configurazione l'app resta solo locale.

Impegno: fase 1 un giorno; fase 2 tre giorni; fasi 3–4 una settimana.

---

## 4. Oltre circa 25 persone: perché la cartella condivisa diventa il limite e come superarlo

### Perché

Con la cartella condivisa ogni PC è sia «client» sia «server»: legge e scrive direttamente i file su SMB. I costi crescono con il numero di persone **N** e di progetti **P**:

1. **Controllo dei cambiamenti.** Ogni PC controlla la cartella ogni 4 secondi. Prima della 0.3.0, a ogni cambiamento ricalcolava la data di tutti i file (P richieste). Con N PC e scritture frequenti: N × P richieste ogni pochi secondi sul file server. A 25 persone e 200 progetti sono migliaia di richieste al minuto, e SMB su VPN ha latenze di 30–100 ms l'una.
2. **File condivisi «caldi».** `audit.json` (cronologia) e `users.json` sono un file unico per tutti: ogni operazione li rilegge, li riscrive per intero e ne prende il lock. Con molte persone la coda sul lock si allunga e il file (fino a 5000 voci) viaggia per intero a ogni modifica.
3. **Progetti grandi e popolari.** Un progetto è un file: più persone sullo stesso progetto = attese sul suo lock e riletture dell'intero file (con centinaia di task e commenti, centinaia di KB) per ogni modifica di un collega.
4. **Cache di SMB.** Windows tiene in cache i metadati delle cartelle di rete (10 s di default): le date possono arrivare in ritardo, e i lock opportunistici (oplock) di SMB si interrompono a ogni accesso concorrente.

### Come superarlo (senza aggiungere un server)

Interventi in ordine di rapporto beneficio/costo:

| # | Intervento | Effetto | Stato |
|---|---|---|---|
| 1 | **Firma per cartella** | si interrogano solo le cartelle cambiate: il rinnovo della presenza di un collega non fa rileggere i progetti | **fatto nella 0.3.0** |
| 2 | **Cronologia a file per mese e per PC** (`audit/2026-10.<utente>-<PC>.json`) | niente più lock condiviso né riscrittura del file intero: ognuno scrive solo i propri file | **fatto nella 0.4.0** |
| 3 | **Giornale delle modifiche** (`changes/<utente>.log`, una riga per scrittura: file, versione, ora) | gli altri PC leggono solo le righe nuove dei giornali (pochi byte) invece di interrogare le date dei file: il costo del controllo non dipende più dal numero di progetti. I giornali si compattano ogni giorno | **fatto nella 0.4.0** |
| 4 | **Polling adattivo** | 4 s quando la finestra è in primo piano, 30 s in secondo piano, 60 s dopo 5 minuti di inattività, 2 minuti ridotta a icona: con 100 persone, di cui 20 attive, il carico scende di 4–5 volte | **fatto nella 0.4.0** |
| 5 | **Progetti divisi a capitoli** (`projects/<id>/meta.json` + un file ogni 100 task, commenti separati) | si riscrive e rilegge solo il pezzo toccato; meno attese sui lock dei progetti molto usati | **fatto nella 0.4.0** (da 300 task, capitoli da circa 150) |
| 6 | **Avviso istantaneo nella LAN** (facoltativo) | dopo una scrittura il PC manda un pacchetto UDP multicast «progetto X versione 42» sulla rete locale; gli altri rileggono subito senza aspettare il polling, che può rallentare a 30 s. Nessun dato nel pacchetto, solo l'id e la versione; se la rete lo blocca resta il polling | 3 giorni |
| 7 | **Nodo di sincronizzazione** (solo per organizzazioni grandi) | un PC dell'ufficio sempre acceso fa da «hub»: gli altri gli chiedono cosa è cambiato (HTTP nella LAN) invece di interrogare la cartella. La cartella resta la fonte dei dati: se l'hub si spegne si torna al funzionamento normale | 2 settimane |

Con 1–4 si arriva comodamente a **100 persone** sulla stessa cartella; con 5–6 a qualche centinaio. Il 7 serve solo oltre. Il lavoro fuori ufficio della 0.3.0 (copia sul PC + unione campo per campo) è già la base per i passi 3 e 7: le modifiche diventano operazioni da applicare, non file da riscrivere.
