# Project Goal Manager — piano di completamento, prezzi, lancio e marketing

Documento operativo, aggiornato al 15 ottobre 2026. Parte dallo stato reale del repository (app 0.1.0 compilata, sito statico in `Web/`) e arriva a un prodotto vendibile, con prezzi per funzionalità, un calendario di lancio e un piano marketing sostenibile da una persona sola.

Le fonti consultate sono elencate in fondo (§12). I numeri di terzi sono stime di aggregatori, non dati certificati: vanno letti come ordini di grandezza.

---

> **Nota del 16 ottobre 2026.** Il progetto si chiama ora **Todo Doto** (repository `Nisiix/Todo-Doto`, versione 0.2.25) ed è proseguito in parallelo con funzioni proprie: sezioni Stack/Todo/Gantt/Allegati, configurazione guidata del PC, GitHub, Analisi, copie di sicurezza, app in italiano e in inglese. Le implementazioni descritte in §0 (licenze verificate nell'app, prova di 14 giorni, updater, export, import CSV/Trello, timeline) sono conservate nel ramo `lavoro-lancio-2026-10-15` e **non sono ancora nell'app pubblicata**: il sito espone i piani e i prezzi, mentre il controllo dei posti e delle funzioni per piano va portato nel codice di Todo Doto come passo successivo. Strategia, prezzi, lancio e marketing restano validi.

## 0. Stato di avanzamento (15 ottobre 2026)

Implementato nel repository, verificato con typecheck, 82 test unitari, 13 test end-to-end e build dell'installer 0.2.0 con firme dell'updater:

| Area | Fatto | Dove |
|---|---|---|
| Licenze e piani (P1, P2, P3) | Free/Team/Business, posti, sola lettura oltre i posti, prova 14 giorni, `license.json` firmato Ed25519 verificato in locale, dialog «Piano e licenza», banner, riquadri «disponibile nel piano», gating di progetti riservati, Cleaner, cronologia (90 giorni / illimitata), export, Drive, backup | `Desktop/src/services/license.ts`, `stores/workspace.ts`, `components/dialogs/LicenseDialog.vue`, `layout/PlanBanner.vue` |
| Emissione licenze (B2) | Chiavi in `~/.pgm/`, script `license-keygen.mjs` e `issue-license.mjs`, Cloudflare Worker per Paddle / Lemon Squeezy con email via Resend | `Desktop/scripts/`, `tools/license-server/` |
| Updater (D2) | Plugin updater + process, chiavi in `~/.tauri/`, endpoint su GitHub Releases, controllo all'avvio e da Impostazioni, rispetto di `updatesUntil` per le perpetue | `src-tauri/`, `services/updater.ts`, `stores/updates.ts` |
| CI e Release (D3, D4, D7) | `build-windows.yml` (typecheck, unit, e2e, build, firma se c'è il certificato, Release con `latest.json` e `SHA256SUMS.txt`, `manifest.json`), `site.yml` (GitHub Pages + manifest dai download), repository git inizializzato | `.github/workflows/` |
| Onboarding (P4) | «Primi passi» in quattro punti, workspace di esempio con tre progetti, banner con «Crea il mio workspace» | `views/WelcomeView.vue`, `services/demo.ts` |
| Export (P6) | CSV per Excel e pagina di stampa / PDF | `services/export.ts`, `views/PrintView.vue` |
| Backup (P8) | Snapshot giornaliero in `_backup/` (14 conservati), creazione e ripristino dalle Impostazioni | `services/storage.ts`, `SettingsDialog.vue` |
| Feedback e novità (P9, P10) | «Segnala un problema» con email precompilata, registro errori locale, `CHANGELOG.md` e dialog «Novità» dopo l'aggiornamento | `services/diagnostics.ts`, `WhatsNewDialog.vue` |
| Sito (S1, S2, S4, S7, S10, S11) | Prezzi con toggle annuale/perpetua e offerta di lancio, FAQ, download con impronte e `winget`, barra fiducia, Open Graph e JSON-LD, `changelog.html`, `guida.html`, `vs-trello.html`, `vs-excel.html`, `en/index.html`, pagine legali aggiornate (licenze, pagamenti, updater) | `Web/` |

Aggiornamento del 16 ottobre 2026: fatti anche **interfaccia in inglese** (P5: 460 stringhe, Impostazioni → Lingua o lingua del sistema), **import CSV/Trello** (P7), **notifiche di Windows** (P11), **timeline** (P12, piano Business); Business con **utenti illimitati**; **nessuna licenza perpetua**, solo abbonamento; nuovi prezzi (Team 49,90 €/anno o 5,90 €/mese, Business 149,90 €/anno o 14,90 €/mese). Restano fuori dal codice: certificato OV, dominio ed email, Merchant of Record, segreti GitHub, winget (procedure in [GUIDA-OPERATIVA.md](./GUIDA-OPERATIVA.md)) e video, testimonianze, newsletter, analytics (richiedono beta e account). Nota: i test end-to-end esistevano già (9) e sono stati estesi (16).

---

## 1. Sintesi

| Domanda | Risposta breve |
|---|---|
| Cosa vendiamo | Una roadmap condivisa per uffici con un server di rete: nessun cloud, nessun account, dati in una cartella. Il “senza server” è il prodotto, non un dettaglio tecnico. |
| A chi | Team da 3 a 25 persone con una cartella condivisa già esistente: studi tecnici e professionali, piccole software house, agenzie, uffici tecnici di PMI, enti locali. Prima l'Italia, poi l'Europa in inglese. |
| Modello | Free per uso personale e micro-team, **Team** in abbonamento (annuale o mensile) a prezzo fisso per workspace, **Business** con utenti illimitati. Solo abbonamento, nessuna licenza perpetua. Licenze verificate offline (file firmato nella cartella del workspace). |
| Prezzi | Free · Team 49,90 €/anno o 5,90 €/mese (fino a 10 utenti) · Business 149,90 €/anno o 14,90 €/mese (utenti illimitati). Offerta di lancio -40% per i primi 100 workspace. |
| Cosa manca per vendere | Fatto nel codice (vedi §0). Restano le pratiche esterne: certificato OV, dominio ed email, Merchant of Record, segreti GitHub, winget: passo per passo in [GUIDA-OPERATIVA.md](./GUIDA-OPERATIVA.md). |
| Quando | 10 settimane: 4 di prodotto, 2 di beta chiusa, 2 di preparazione lancio, settimana di lancio, poi 90 giorni di marketing continuativo. |
| Obiettivo 12 mesi | 2.000 download, 150 workspace di rete attivi, 40 workspace paganti, circa 3.000 € ARR (prezzi più bassi, volume più alto). Mediana dei micro-SaaS su Starter Story: 20 K$/mese, ma la mediana reale dei SaaS indie è 145 $/mese: l'obiettivo è realistico, non ottimistico. |

---

## 2. Cosa insegnano Starter Story e i SaaS recenti (applicato a noi)

### 2.1 Pattern ricorrenti su Starter Story

Starter Story (oggi parte di HubSpot) è un database di oltre 3.000 attività con ricavi stimati, canali di crescita e stack. Le pagine lette non contengono un articolo “come lanciare un SaaS”; le lezioni emergono dai filtri e dai profili.

| Lezione | Evidenza | Come la applichiamo |
|---|---|---|
| Prendi una fetta di un mercato già provato | Il fondatore di Vugola (11 K$ MRR a 19 anni): «c'è un mercato provato… prendine una fetta». Database “David vs Goliath” (220 attività, mediana 200 K$/mese). | Il mercato è quello di Trello/Asana/Planner. La fetta: chi non vuole o non può usare il cloud. |
| Costi di avvio minuscoli, canali ripetibili | La maggior parte dei SaaS in elenco parte con 100–1.000 $ e 30–90 giorni. Canali più citati: SEO (articoli), passaparola, Product Hunt, email, affiliazione, marketplace esistenti. | Budget sotto i 600 €/anno (certificato, dominio, MoR). Un'abitudine quotidiana di marketing da 45 minuti. |
| Le app desktop indie crescono su Product Hunt, Hacker News e Reddit | Voicy (10–18 K$/mese) e Lucky Dangle (1 K$/mese) citano esattamente questi tre canali. | Lancio coordinato su PH + Show HN + subreddit mirati, con l'angolo “local-first, zero server”. |
| Monetizzazione ibrida è normale | Gorilla ROI (~23 K$/mese, add-on per PMI): «abbonamenti ricorrenti e one-time / lifetime deal». Filtri del sito: `one-time-license`, `annual-license`, `on-premise-licensing`, `teams-plan`. | Abbonamento annuale come offerta principale, perpetua come alternativa per chi odia gli abbonamenti (tipico delle PMI italiane). |
| Semplifica tutto | «Taglia lo sforzo del 50%; più il prodotto è facile da capire, più incassa.» | Una frase di posizionamento, tre piani, un solo pulsante Scarica. Niente roadmap pubblica infinita. |
| ICP tracciati dal sito | Esistono filtri per “Windows Users Seeking Productivity Tools”, “Project Managers”, “SMBs”, “Teams”. | È la nicchia giusta: confermata come categoria riconosciuta, non inventata. |

### 2.2 Cosa fanno i prodotti recenti che hanno funzionato

| Prodotto | Modello | Insegnamento per noi |
|---|---|---|
| **Obsidian** | App gratuita senza limiti; si paga Sync (4 $/utente/mese), Publish e la **licenza commerciale 50 $/utente/anno** | Il core gratuito costruisce fiducia; si paga l'uso in azienda. Per noi: uso personale gratis, uso in rete a pagamento. |
| **Screen Studio** | Ha tolto la lifetime (229 $) nell'ottobre 2025: «adozione bassa, prezzo non giustificato»; ora solo 29 $/mese o 108 $/anno | Una perpetua troppo cara non vende. Se la offriamo, dev'essere 2–2,5× l'annuale, con aggiornamenti limitati a 1 anno (modello JetBrains/Sublime). |
| **Basecamp** | 15 $/utente/mese oppure **flat 299–349 $/mese illimitato** | Il flat per workspace è semplice da approvare per una PMI e non punisce chi aggiunge colleghi. Lo adottiamo. |
| **Height / Linear** | 8,50–10 $/utente/mese, free tier generoso | Benchmark di prezzo per utente: il nostro Team a 149 €/anno per 10 utenti equivale a 1,24 €/utente/mese, cioè 1/7 di Height: coerente con “niente server, niente costi ricorrenti nostri”. |
| **Raycast** | Freemium, Pro 10 $, Teams 15 $/utente/mese | Il team plan è il motore di ricavo anche per app desktop. |
| **Dati aggregati 2026** | 3.787 SaaS indie: mediana 145 $/mese, 23,5% della coorte 2025 sopra 1 K$ MRR; chi ce la fa «non ha mollato» | Pianificare su 12–24 mesi, non su un lancio. |
| **Benchmark conversione** | Freemium self-serve 3–8% free→paid; trial con carta 48%, senza carta 18% | Il free deve essere utile da solo (uso locale) ma il valore “rete” deve richiedere la licenza entro 14 giorni. |

---

## 3. Posizionamento

**Frase guida (sito, store, Product Hunt):**
> La roadmap condivisa del tuo ufficio, in una cartella di rete. Nessun server, nessun account, nessun cloud.

**Tagline inglese:** *Shared project roadmaps for teams on a network drive. No server, no accounts, no cloud.*

**Alternative che il cliente sta valutando e perché scegliere noi:**

| Alternativa | Dove perde | Dove vinciamo |
|---|---|---|
| Trello / Planner / Asana | Cloud obbligatorio, account per tutti, dati fuori sede, costo per utente | Dati sulla cartella che l'ufficio ha già; zero amministrazione; costo fisso |
| Excel condiviso su Z: | Conflitti di scrittura, nessuna cronologia, nessuna notifica | Scritture atomiche, cronologia, notifiche, domande con @menzioni |
| Vikunja / Redmine self-hosted | Serve un server, Docker, manutenzione | Un `.exe` e una cartella |
| Super Productivity, Will Be Done | Pensati per una persona | Multiutente, ruoli, progetti riservati |

**ICP primario (Italia):** uffici con 3–25 persone e un server di rete già in uso: studi di ingegneria e architettura, studi commercialisti e legali, piccole software house e web agency, uffici tecnici di aziende manifatturiere, uffici comunali. Decisore: titolare o responsabile IT interno/esterno. Trigger di acquisto: «abbiamo provato Trello ma il titolare non vuole i dati in cloud» oppure «usiamo un Excel condiviso e ci sovrascriviamo».

**ICP secondario (estero, inglese):** team privacy-first, ambienti air-gapped, consulenti IT che installano reti per PMI.

---

## 4. Cosa manca: analisi dei gap

Legenda priorità: **P0** senza questo non si vende · **P1** serve per il lancio · **P2** entro 90 giorni dal lancio · **P3** dopo.

### 4.1 Distribuzione e fiducia

| # | Gap | Stato attuale | Priorità | Soluzione |
|---|---|---|---|---|
| D1 | Firma del codice | Installer non firmati: SmartScreen mostra «editore sconosciuto» | **P0** | Certificato OV da una CA (Certum, SSL.com, Sectigo: 150–300 €/anno; Certum è il più economico per sviluppatori europei). Azure Artifact Signing (≈10 $/mese) richiede azienda con 3+ anni o persona fisica in USA/Canada: non disponibile per una partita IVA italiana giovane. Configurare `bundle.windows.certificateThumbprint` o `signCommand` in `tauri.conf.json` e firmare in CI. La reputazione SmartScreen cresce con i download firmati: è l'unico modo legittimo di far sparire l'avviso. |
| D2 | Aggiornamenti automatici | Nessun updater | **P0** | `tauri-plugin-updater` + `createUpdaterArtifacts: true`; coppia di chiavi con `tauri signer generate`, chiave privata in GitHub Secrets; `latest.json` come asset della Release. Backup della chiave privata fuori dal PC. |
| D3 | CI e Release | `.github/workflows/` è vuota: il workflow citato nel README è andato perso nella riorganizzazione in monorepo | **P0** | Ricreare `build-windows.yml` con `working-directory: Desktop`, `tauri-apps/tauri-action`, firma, updater e Release automatica sui tag `v*`. Inizializzare il repository git nella radice (oggi non è un repo). |
| D4 | Pagina download reale | I pulsanti rimandano alle Release GitHub; `manifest.json` non esiste | **P1** | Generare `Web/downloads/manifest.json` in CI (nome, dimensione, SHA-256) e pubblicarlo insieme al sito. |
| D5 | winget | Assente | **P1** | Manifest in `microsoft/winget-pkgs` (installer `.exe` NSIS); aggiornamento automatico con `wingetcreate` dalla CI a ogni Release. Chi installa da winget è spesso l'IT interno: è il nostro decisore. |
| D6 | Microsoft Store | Assente | **P3** | Pacchetto MSIX via Partner Center; serve una build senza updater (lo Store rifiuta app che si aggiornano da sole). Valutare dopo i primi 500 download. |
| D7 | Verifica integrità | README promette «verifiche di integrità pubbliche» ma non ci sono | **P1** | `SHA256SUMS.txt` allegato a ogni Release e mostrato sulla pagina download. |

### 4.2 Prodotto

| # | Gap | Priorità | Soluzione |
|---|---|---|---|
| P1 | Licenze e piani | **P0** | File `license.json` nella cartella del workspace, firmato Ed25519 dal nostro server di vendita; verifica **offline** nel backend Rust (chiave pubblica incorporata). Contiene: piano, numero massimo utenti, scadenza aggiornamenti, email acquirente. Funziona in LAN chiusa: nessuna chiamata di rete, che è esattamente ciò che l'ICP vuole. Stato «Free» se il file manca. |
| P2 | Limiti del piano Free applicati nell'app | **P0** | In modalità rete: oltre 3 utenti in `users.json` l'app chiede la licenza (banner non bloccante per 14 giorni, poi sola lettura per gli utenti oltre il terzo). Uso locale sempre illimitato. |
| P3 | Prova gratuita del piano Team | **P1** | Trial di 14 giorni generato dalla schermata Impostazioni → Licenza senza carta (converte al 18%, ma abbassa l'attrito; la versione con carta si prova dopo). |
| P4 | Onboarding | **P1** | Al primo avvio: workspace di esempio «Demo» precompilato (3 progetti, domande aperte, scadenze) con un banner «Crea il tuo workspace». Tour di 4 passi in-app (nuovo elemento, dettaglio, filtri, condivisione). |
| P5 | Lingua inglese | **P1** | `vue-i18n` con `it` e `en`; stringhe estratte dai componenti; lingua da `plugin-os` `locale()`. Sito in `Web/en/`. Necessario per Product Hunt e Hacker News. |
| P6 | Export | **P1** | Export CSV del progetto e stampa/PDF della roadmap (già «evoluzione possibile» in PROGETTO.md §10). Il PDF è la funzione «da far vedere al capo»: va nel piano Team. |
| P7 | Import | **P2** | Import CSV generico e da Trello (JSON export) per abbattere il costo di cambio. |
| P8 | Backup e snapshot | **P2** | Snapshot giornaliero della cartella workspace in `_backup/` (ultimi 14) con ripristino dalle Impostazioni. Rassicura chi teme di «perdere il file». |
| P9 | Feedback e diagnostica | **P1** | Voce «Segnala un problema» che apre una email precompilata con versione, OS e ultimi 50 righe di log locale. Nessuna telemetria automatica: dichiararlo esplicitamente è un argomento di vendita. |
| P10 | Novità e changelog | **P1** | Dialog «Novità in questa versione» dopo un aggiornamento, alimentato da `CHANGELOG.md`. |
| P11 | Notifiche desktop | **P2** | `tauri-plugin-notification` per @menzioni e domande rivolte a me, con opt-in. |
| P12 | Timeline scadenze | **P3** | Vista calendario/timeline per workspace (piano Business). |
| P13 | Test e2e | fatto | Esistevano già 9 test in `e2e/app.spec.ts`; aggiunti 4 in `e2e/plan.spec.ts` (esempio, piani, licenza, prova, export, stampa). |
| P14 | Accessibilità e robustezza | **P2** | Audit tastiera/screen reader; test con 3 PC che scrivono lo stesso progetto in contemporanea su SMB, documentato come pagina «Affidabilità» sul sito. |

### 4.3 Sito e materiale commerciale

| # | Gap | Priorità | Soluzione |
|---|---|---|---|
| S1 | Pagina Prezzi | **P0** | Sezione `#prezzi` in `index.html` con i tre piani, toggle annuale/perpetua, FAQ sulle licenze; pulsante «Acquista» verso il checkout del Merchant of Record. |
| S2 | FAQ | **P1** | 10 domande: dove sono i dati, cosa succede senza internet, cosa succede se scade la licenza, backup, GDPR, VPN, Mac. |
| S3 | Video demo di 60 secondi | **P1** | Registrazione schermo con voce; gira su sito, PH, LinkedIn. Le app desktop si giudicano male dalle immagini statiche. |
| S4 | Pagine di confronto | **P2** | `vs-trello.html`, `vs-excel.html`, `vs-planner.html`: sono le query con intenzione d'acquisto. |
| S5 | Blog / guide | **P2** | 2 articoli al mese sul tema «gestire progetti in ufficio senza cloud». |
| S6 | Newsletter e lista d'attesa | **P1** | Form email (Buttondown o Listmonk) in hero e footer; si usa per beta, lancio e release. |
| S7 | Changelog pubblico | **P1** | `changelog.html` generato da `CHANGELOG.md`. |
| S8 | Prove sociali | **P1** | 3 testimonianze dalla beta con nome, ruolo e studio; loghi se concessi. |
| S9 | Analytics rispettose | **P1** | Plausible o Umami (senza cookie, niente banner). Eventi: click Scarica, click Acquista, conversione checkout. |
| S10 | Pagine legali da aggiornare | **P0** | Privacy e condizioni devono coprire licenze, pagamenti tramite MoR, dati di fatturazione, email di supporto. |
| S11 | Versione inglese del sito | **P1** | `Web/en/index.html` con `hreflang`. |
| S12 | Dominio ed email | **P0** | Dominio dedicato (es. `projectgoalmanager.app` o `.it`), email `supporto@`, DNS con SPF/DKIM per le email transazionali. |

### 4.4 Business e operatività

| # | Gap | Priorità | Soluzione |
|---|---|---|---|
| B1 | Merchant of Record | **P0** | Paddle o Lemon Squeezy (5% + 0,50 $ a transazione, gestiscono IVA UE e fattura al cliente) oppure Polar (4% + 0,40 $, registrato OSS in Irlanda). Scelta consigliata: **Paddle** per stabilità e fatturazione B2B; Lemon Squeezy è in migrazione verso Stripe Managed Payments. Verificare con il commercialista il trattamento delle fatture del MoR (reverse charge) e il regime fiscale della partita IVA. |
| B2 | Server licenze | **P0** | Una funzione serverless (Cloudflare Worker, gratis) che riceve il webhook «ordine pagato» del MoR, genera `license.json` firmato e lo invia per email. Nessun database necessario: la firma basta. |
| B3 | Supporto | **P1** | Email `supporto@` con risposta entro 1 giorno lavorativo (piano Team) e 4 ore (Business, dichiarato sul sito). Pagina «Guida» con 8 articoli. |
| B4 | Metriche | **P1** | Foglio mensile: download (GitHub + winget), attivazioni trial, licenze, MRR/ARR, churn annuale, richieste di supporto. |
| B5 | Termini di licenza | **P0** | EULA per la perpetua e per l'abbonamento (cosa succede alla scadenza: l'app continua a funzionare nella versione corrente, senza aggiornamenti). |

---

## 5. Prezzi per funzionalità

### 5.1 Principi

1. **Flat per workspace**, non per utente: una PMI approva «149 € l'anno» in cinque minuti; «4 € a utente al mese» apre una trattativa. Basecamp e i nostri costi (zero server) lo permettono.
2. **Il gratuito deve restare utile per sempre** per una persona sola (modello Obsidian): è il canale di acquisizione.
3. **Si paga la collaborazione**: utenti in rete, ruoli, cronologia, progetti riservati.
4. **Solo abbonamento** (annuale o mensile): nessuna licenza perpetua, così gli aggiornamenti sono sempre inclusi e il prezzo resta semplice da spiegare (lezione Screen Studio: la lifetime non vendeva e complicava il supporto).
5. **Prezzo in euro, IVA esclusa, fattura intestata all'azienda** (lo fa il MoR).

### 5.2 Piani

| | **Free** | **Team** | **Business** |
|---|---|---|---|
| Prezzo | 0 € | **49,90 €/anno** per workspace (o 5,90 €/mese) | **149,90 €/anno** per workspace (o 14,90 €/mese) |
| Utenti in rete | fino a 3 | fino a 10 | illimitati |
| Workspace locali | illimitati | illimitati | illimitati |
| Progetti, elementi, cartelle, etichette | illimitati | illimitati | illimitati |
| Commenti, domande, @menzioni, allegati | ✓ | ✓ | ✓ |
| Aggiornamento live multiutente | ✓ | ✓ | ✓ |
| Progetti riservati (membri per progetto) | — | ✓ | ✓ |
| Ruoli Cleaner e gestione membri | — | ✓ | ✓ |
| Cronologia operazioni (audit) | — | 90 giorni | illimitata + export CSV |
| Export CSV e PDF della roadmap | — | ✓ | ✓ |
| Replica cartella Google Drive | — | ✓ | ✓ |
| Backup e snapshot automatici | — | ✓ | ✓ |
| Notifiche desktop | — | ✓ | ✓ |
| Timeline scadenze (futura) | — | — | ✓ |
| Supporto | community | email, 1 giorno lavorativo | email prioritaria, 4 ore, onboarding da remoto 30 min |
| Fattura | — | ✓ | ✓ |

Prezzi di lancio: **-40% per i primi 100 workspace** (Team 29,90 €/anno, Business 89,90 €/anno) in cambio di una testimonianza. Scade 30 giorni dopo il lancio. Dopo il primo anno valutare un piano **Consulenti IT** (5 workspace clienti a 499 €/anno, licenza rivendibile): su Starter Story i canali «partner e marketplace» sono tra i più ricorrenti per i tool PMI.

### 5.3 Come viene applicato nell'app

```
<workspace>/license.json   { v, id, plan, seats, issuedTo, email, issuedAt, expiresAt, order, sig }
```

- Verifica Ed25519 in Rust (comando `get_license`), chiave pubblica compilata nel binario. Nessuna chiamata di rete.
- Il piano effettivo è il **massimo tra licenza e Free**: senza file o con firma non valida l'app è Free.
- Superati i 3 utenti in Free: banner «Questo workspace ha 5 membri: attiva una prova di 14 giorni» con un click; alla scadenza gli utenti oltre il terzo entrano in sola lettura, nessun dato viene mai bloccato o cancellato.
- Abbonamento scaduto: l'app resta funzionante nel piano Free, con tutti i dati; gli aggiornamenti restano installabili. Si comunica chiaramente sul sito: «i tuoi dati sono tuoi, sempre».
- Il file è nel workspace, quindi lo vedono tutti i colleghi: una licenza, un ufficio. La duplicazione su più workspace è possibile tecnicamente ma viola l'EULA: per una PMI basta, non serve DRM aggressivo (le verifiche online con risposta non firmata sono comunque aggirabili, come documentato nel feedback a Lemon Squeezy).

---

## 6. Piano di implementazione (10 settimane)

Una persona, circa 25 ore a settimana. Le settimane 1–4 sono prodotto, 5–6 beta, 7–8 preparazione, 9 lancio, 10 consolidamento.

### Fase 0 · Fondamenta (settimane 1–2)

| Attività | Dettaglio | Esito verificabile |
|---|---|---|
| Repository e CI | `git init` nella radice, push su GitHub, ricreare `.github/workflows/build-windows.yml` per la struttura `Desktop/` | Build verde su push, Release su tag `v0.2.0-beta.1` |
| Certificato OV | Ordine a Certum/SSL.com (serve partita IVA o documento d'identità; 3–7 giorni di validazione) | `signtool verify /pa` positivo sull'installer |
| Updater | Plugin, chiavi, `latest.json` in Release, test da 0.1.0 → 0.2.0 | L'app installata si aggiorna da sola |
| Licenze | `license.json`, verifica Ed25519 in Rust, schermata Impostazioni → Licenza, trial 14 giorni | Test unitari su firma valida/scaduta/manomessa |
| Limiti Free | Conteggio utenti in rete, banner, sola lettura oltre il terzo | Test e2e con 4 utenti simulati |
| Legale | EULA, aggiornamento privacy e condizioni, dominio ed email | Pagine pubblicate |

### Fase 1 · Prodotto vendibile (settimane 3–4)

| Attività | Dettaglio |
|---|---|
| Onboarding | Workspace Demo, tour in 4 passi, pagina «Primi passi» nella Guida |
| i18n | `vue-i18n`, estrazione stringhe, inglese completo, rilevamento lingua |
| Export | CSV del progetto; PDF della roadmap (stampa via WebView2 con foglio di stile dedicato) |
| Changelog in-app | Dialog Novità + `CHANGELOG.md` |
| Feedback | Voce «Segnala un problema» con log locale |
| Test | 3 e2e critici; test di concorrenza su SMB con 3 macchine, risultati nella pagina «Affidabilità» |
| MoR | Account Paddle (o alternativa), prodotti e prezzi configurati, webhook → Worker → email con licenza; acquisto di prova in sandbox |

### Fase 2 · Beta chiusa (settimane 5–6)

- 10–15 uffici reclutati dalla rete personale, da LinkedIn e da 2 consulenti IT; obiettivo: 5 workspace di rete reali con almeno 3 utenti.
- Chiamata di 20 minuti con ciascuno: prezzo proposto, obiezioni, funzione mancante più citata. Il prezzo finale si fissa qui.
- Correzioni e seconda beta `v0.2.0-beta.2`. Raccolta di 3 testimonianze e 2 screenshot reali (con permesso).

### Fase 3 · Preparazione lancio (settimane 7–8)

| Attività | Dettaglio |
|---|---|
| Sito | Sezione Prezzi, FAQ, changelog, newsletter, analytics, versione inglese, pagina download con manifest e SHA-256, testimonianze |
| Video | 60 secondi: problema (Excel condiviso), soluzione (una cartella), tre funzioni, prezzo |
| Materiale | 6 immagini 1270×760 per Product Hunt, GIF di 10 s, testo per Show HN, 3 post LinkedIn, email di lancio |
| Directory | Schede su AlternativeTo, Capterra, G2, Softpedia, Uneed, MicroLaunch, DevHunt, BetaList (coda gratuita: inviare 8 settimane prima) |
| winget | Primo manifest inviato e approvato |
| Lista d'attesa | Obiettivo 150 iscritti prima del lancio (newsletter + beta + LinkedIn) |
| Release | `v1.0.0` taggata il venerdì prima del lancio, firmata, con updater e licenze attive |

### Fase 4 · Settimana di lancio (settimana 9)

| Giorno | Canale | Note |
|---|---|---|
| Lunedì | Newsletter + LinkedIn + X | «È uscita la 1.0», sconto -40% primi 100 workspace |
| Martedì | **Product Hunt** (00:01 PT) | Hunter con seguito nella nicchia tool/produttività; rispondere a ogni commento entro 10 minuti nelle prime 4 ore; il primo commento è del maker e spiega il perché del «senza server» |
| Mercoledì | **Show HN** | Titolo: «Show HN: Project Goal Manager – shared team roadmaps on a network drive, no server». HN premia il merito tecnico: raccontare scritture atomiche, read-before-write, watcher + polling su SMB |
| Giovedì | Reddit | r/sysadmin, r/smallbusiness, r/msp, r/productivity, r/ItalyInformatica: post «ho costruito…» con la storia, non il link in prima riga |
| Venerdì | Comunità italiane e stampa di settore | Indie Hackers, HTML.it, forum commercialisti e studi tecnici, 5 newsletter italiane di produttività/IT per PMI |
| Tutta la settimana | Email diretta | 50 studi/agenzie della zona con messaggio personale di 4 righe e il video |

### Fase 5 · 90 giorni dopo (settimane 10–22)

- Abitudine quotidiana (45 min): un post o commento utile su LinkedIn/Reddit/forum, un'email a un consulente IT, un'interazione con un utente.
- 2 articoli SEO al mese + 3 pagine di confronto nel primo mese.
- Release mensile con changelog pubblico: ogni release è un motivo per scrivere.
- Programma partner consulenti IT: 20% di commissione (affiliazione del MoR) o licenza multi-workspace.
- Revisione prezzi a 90 giorni con i dati reali di conversione.

---

## 7. Marketing: canali e priorità

| Canale | Perché | Costo | Priorità |
|---|---|---|---|
| **SEO in italiano** (query: «gestione progetti senza cloud», «todo condiviso cartella di rete», «alternativa Trello offline», «Trello on premise») | Canale n.1 su Starter Story; concorrenza bassa in italiano; intenzione alta | tempo | Alta |
| **Pagine di confronto** vs Trello, Excel, Planner, Vikunja | Query di decisione | tempo | Alta |
| **Consulenti IT e system integrator** | Installano le reti dei nostri clienti; un partner porta 5–10 uffici | 20% commissione | Alta |
| **LinkedIn founder-led** (build in public, 3 post/settimana) | ICP italiano è su LinkedIn, non su X | tempo | Alta |
| **Product Hunt + Show HN + Reddit** | Canali citati dalle app desktop indie di successo; portano i primi 500 download e backlink | tempo | Alta (una tantum) |
| **winget, AlternativeTo, Softpedia, Capterra/G2** | Traffico passivo da ricerche «alternative a…»; gli IT cercano su winget | gratis | Media |
| **Email diretta** a studi e agenzie locali | Conversione alta nelle PMI; permette le interviste prezzo | tempo | Media |
| **Newsletter mensile** | Release + consiglio pratico; mantiene i free caldi | 0–10 €/mese | Media |
| **Video YouTube** (3 tutorial da 3 minuti) | SEO video su «come condividere una lista attività in ufficio» | tempo | Media |
| **AppSumo / lifetime deal** | Citato su Starter Story, ma attira clienti a basso valore e svaluta il prezzo | — | No (per ora) |
| **Ads** | Senza dati di conversione sono soldi buttati; rivalutare a 6 mesi con 500 € di test su Google «software gestione progetti senza server» | 500 € | Bassa |

Messaggi chiave da ripetere ovunque:
1. I dati restano nella vostra cartella: niente cloud, niente account, GDPR semplice.
2. Funziona con il server che avete già, anche senza internet.
3. Un prezzo fisso per ufficio, non per persona.
4. Le modifiche di più colleghi si sommano, non si sovrascrivono.

---

## 8. Landing page: modifiche concrete a `Web/index.html`

| Posizione | Oggi | Modifica |
|---|---|---|
| Hero | «Gratuita · Windows 10/11» | Nuovo titolo: «La roadmap condivisa del tuo ufficio, in una cartella di rete.» Meta: «Gratuita per uso personale · Team da 149 €/anno · Windows 10/11». CTA secondaria: «Guarda il video (60 s)». |
| Sotto l'hero | — | Barra fiducia: «Nessun dato lascia il vostro server · Installer firmato · Senza account · Aggiornamenti automatici». |
| Nav | 4 voci + Scarica | Aggiungere **Prezzi** e **Guida**. |
| Nuova sezione `#prezzi` | — | Tabella §5.2 con toggle «Annuale / Perpetua», badge «-40% primi 100 workspace», pulsante Acquista (checkout MoR) e «Prova 14 giorni dall'app». |
| Nuova sezione `#faq` | — | 10 domande di §4.3 S2. |
| `#download` | Pulsanti verso GitHub, nota «server in preparazione» | Manifest reale, dimensione, SHA-256, «Installa con winget: `winget install Nisos.ProjectGoalManager`», badge «Firmato digitalmente». |
| Nuova sezione testimonianze | — | 3 citazioni della beta con nome e studio. |
| Footer | Legali + GitHub | Aggiungere Changelog, Guida, Contatti, selettore lingua IT/EN, iscrizione newsletter. |
| `<head>` | Meta base | Open Graph e Twitter card con immagine 1200×630, JSON-LD `SoftwareApplication` con prezzo e sistema operativo, `hreflang` it/en, script Plausible. |
| Pagine nuove | — | `prezzi.html` (ancora alla sezione), `faq.html`, `changelog.html`, `guida/`, `vs-trello.html`, `vs-excel.html`, `en/index.html`, `affidabilita.html`. |

Lo stile esistente (`site.css`, tema chiaro/scuro, barre di priorità) resta: è coerente con l'app ed è già un elemento distintivo.

---

## 9. Metriche e obiettivi

| Metrica | Come si misura | 30 giorni | 90 giorni | 12 mesi |
|---|---|---|---|---|
| Download | GitHub Releases + winget + manifest | 500 | 1.000 | 2.000 |
| Workspace di rete attivi (≥3 utenti) | trial richiesti + licenze (nessuna telemetria) | 30 | 80 | 150 |
| Trial Team attivati | Worker licenze | 25 | 60 | 120 |
| Conversione trial → pagato | Worker + MoR | 15% | 20% | 25% |
| Workspace paganti | MoR | 4 | 12 | 30 |
| ARR | MoR | 500 € | 1.600 € | 6.000 € |
| Iscritti newsletter | Buttondown | 300 | 500 | 1.200 |
| Richieste di supporto per licenza / mese | email | <2 | <1,5 | <1 |

Se a 90 giorni la conversione trial → pagato è sotto il 10%, il problema è il prezzo o i limiti del Free: rifare 10 interviste prima di toccare le funzioni.

---

## 10. Budget annuale

| Voce | Costo |
|---|---|
| Certificato OV code signing | 150–300 € |
| Dominio + DNS | 15–30 € |
| Email (Zoho/Fastmail) | 0–40 € |
| Newsletter (Buttondown fino a 1.000 iscritti) | 0–100 € |
| Analytics (Umami self-hosted o Plausible) | 0–90 € |
| Cloudflare Worker licenze | 0 € |
| MoR | 5% + 0,50 $ per vendita (nessun fisso) |
| Hunter / promozione Product Hunt | 0 € (mai pagare upvote) |
| **Totale fisso** | **circa 200–560 €/anno** |

Break-even sui costi fissi: 4 workspace Team.

---

## 11. Rischi

| Rischio | Probabilità | Mitigazione |
|---|---|---|
| SmartScreen continua ad avvisare anche con certificato OV nei primi mesi | Alta | Spiegarlo nella pagina download con screenshot «Ulteriori informazioni → Esegui comunque»; la reputazione cresce con i download; winget come via alternativa |
| Il Free a 3 utenti è troppo generoso (nessuno paga) o troppo stretto (nessuno prova) | Media | Decidere con le interviste della beta; cambiare il limite è una costante |
| Corruzione dati su SMB con molti utenti | Media | Test di concorrenza documentato, backup automatici (P8), formato un-file-per-progetto già previsto |
| Dipendenza da un MoR che cambia condizioni (caso Lemon Squeezy) | Media | Il Worker licenze è indipendente dal MoR: cambiare fornitore richiede solo un nuovo webhook |
| Un solo sviluppatore | Alta | Roadmap pubblica corta, release mensili, nessuna promessa di funzioni grandi (Gantt, mobile) |
| Richieste Mac/Linux | Alta | Tauri le permette; rispondere «dopo i primi 30 clienti Windows»; raccogliere le email interessate |

---

## 12. Fonti

Starter Story (lette il 15 ottobre 2026): [home](https://www.starterstory.com/), [database idee](https://www.starterstory.com/data), [Micro SaaS ideas](https://www.starterstory.com/data/micro-saas-ideas), [profilo Gorilla ROI](https://www.starterstory.com/businesses/gorilla-roi), [intervista Vugola, 11 K$/mese](https://www.starterstory.com/stories/i-m-19-and-i-built-this-11k-month-saas).

Dati e benchmark: [State of Indie SaaS Revenue 2026](https://bigideasdb.com/state-of-indie-saas-revenue-2026) · [Freemium conversion (Monetizely)](https://www.getmonetizely.com/articles/freemium-conversion-rate-the-key-metric-that-drives-saas-growth-3588c) · [B2B SaaS free trial statistics (Flint)](https://www.flint.com/blog/b2b-saas-free-trial-conversion-rate-statistics) · [Freemium SaaS (Userpilot)](https://userpilot.com/blog/freemium-saas/).

Prezzi di riferimento: [Screen Studio toglie la lifetime](https://alternativeto.net/news/2025/10/screen-studio-has-removed-their-non-subscription-licensing-options-for-new-customers/) · [Obsidian pricing](https://obsidian.md/pt-BR/pricing) · [Raycast plans](https://costbench.com/software/ai-productivity/raycast/) · [Basecamp pricing](https://comparedge.com/tools/basecamp/pricing) · [Height vs Linear](https://www.costbench.com/compare/height-vs-linear/) · [Per-seat vs flat-rate](https://comparetiers.com/blog/per-seat-vs-flat-rate-pricing) · [Linear e i modelli di prezzo](https://www.getmonetizely.com/articles/how-do-modern-project-management-tools-like-linear-challenge-legacy-pricing-models).

Distribuzione e tecnica: [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/) · [Microsoft code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) · [Azure Artifact Signing (devclass)](https://devclass.com/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/) · [Code signing 2025 round-up (Moonbase)](https://moonbase.sh/articles/code-signing-audio-plugins-in-2025-a-round-up/) · [Tauri updater](https://v2.tauri.app/plugin/updater/) · [Tauri auto-update senza latest.json manuale](https://dev.to/eddie_mate/tauri-v2-auto-updates-without-maintaining-latestjson-14de) · [winget: submit manifest](https://learn.microsoft.com/vi-vn/windows/package-manager/package/repository) · [Lemon Squeezy license API](https://docs.lemonsqueezy.com/guides/tutorials/license-keys) · [Richiesta di risposte firmate (Lemon Squeezy)](https://lemonsqueezy.nolt.io/807) · [Keylight, licenze offline Ed25519 per Tauri](https://docs.rs/crate/keylight/0.3.2).

Merchant of Record: [Polar fees](https://polar.sh/docs/fees) · [Polar tax](https://docs.polar.sh/merchant-of-record/tax) · [Paddle vs Lemon Squeezy (Dodo)](https://dodopayments.com/blogs/paddle-vs-lemon-squeezy/) · [Merchant of Record 2026 (Cloudstar)](https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/) · [Costi dei provider a 10 K$/mese (Flavio Copes)](https://flaviocopes.com/payment-provider-fees.md).

Lancio: [Product Hunt checklist 48 step](https://www.flowjam.com/blog/product-hunt-launch-checklist) · [Product Hunt 2026 strategy](https://screenhance.com/blog/product-hunt-launch-checklist-2026) · [Beyond Product Hunt 2026](https://dev.to/lightningdev123/beyond-product-hunt-a-technical-launch-guide-for-2026-i2j) · [Product Hunt alternatives (Superframeworks)](https://superframeworks.com/articles/best-product-hunt-alternatives) · [Open-source productivity apps 2025](https://dev.to/johannesjo/open-source-productivity-apps-in-2025-a-careful-comparison-4l8e) · [Routine: local-first](https://open.routine.co/blog/posts/offline-productivity-tools).
