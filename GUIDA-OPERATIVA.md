# Guida operativa: le cose da fare fuori dal codice

Cinque pratiche che il repository non può fare da solo, nell'ordine in cui conviene farle. Tempi e costi sono indicativi (ottobre 2026); le fonti sono in fondo.

| # | Cosa | Costo | Tempo | Serve per |
|---|---|---|---|---|
| 1 | Dominio ed email | 10–30 €/anno + 0–40 €/anno | 1 ora | tutto il resto (certificato, MoR, winget) |
| 2 | Repository GitHub e segreti | 0 € | 30 minuti | build automatica, Release, updater, sito |
| 3 | Certificato OV per la firma del codice | ~110–130 €/anno | 3–10 giorni (validazione) | installer senza blocco SmartScreen |
| 4 | Merchant of Record (Paddle) | 5% + 0,50 € per vendita | 2–7 giorni (approvazione) | pulsanti «Acquista», fatture, IVA |
| 5 | winget | 0 € | 1 ora + revisione | installazione da terminale per gli IT |

---

## 1. Dominio ed email `supporto@projectgoalmanager.app`

1. **Registra il dominio.** `projectgoalmanager.app` su un registrar che vende `.app` (Cloudflare Registrar, Gandi, Namecheap, OVH). Il `.app` è su HSTS preload: il sito funziona solo in HTTPS, che GitHub Pages fornisce. Se preferisci `.it`, serve un registrar italiano (Register.it, Aruba); costa meno e rassicura le PMI.
2. **Casella email.** Scegli una di queste:
   - *Zoho Mail Free* (fino a 5 utenti, solo con dominio proprio): gratis, basta inserire i record MX che Zoho indica.
   - *Fastmail* (circa 3 €/mese) o *Google Workspace* (circa 7 €/mese): più comodi, a pagamento.
   - *Cloudflare Email Routing* (gratis): inoltra `supporto@` alla tua casella attuale; per *rispondere* dal dominio serve comunque un provider o la funzione «invia come» di Gmail con SMTP.
3. **Record DNS** da impostare (il provider ti dà i valori): `MX`, `SPF` (`v=spf1 include:… ~all`), `DKIM`, `DMARC` (`v=DMARC1; p=quarantine; rua=mailto:supporto@…`). Senza SPF/DKIM le email con le licenze finiscono nello spam.
4. **Sito su GitHub Pages con il dominio.** Aggiungi il file `Web/CNAME` con `projectgoalmanager.app`; nel DNS: record `A` verso `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` e `AAAA` verso `2606:50c0:8000::153` … `8003::153` (valori ufficiali GitHub); su GitHub → Settings → Pages → Custom domain → spunta «Enforce HTTPS». Propagazione: minuti, a volte ore.
5. **Nel codice** cambia solo se usi un dominio diverso: `Desktop/src/services/branding.ts` (SITE_URL, SUPPORT_EMAIL) e i `mailto:`/URL nelle pagine in `Web/` (cerca `projectgoalmanager.app`).
6. **Email transazionali** (licenze dal Worker): account gratuito su Resend (3.000 email/mese), verifica del dominio con i record che Resend indica, poi `wrangler secret put RESEND_API_KEY` e `FROM_EMAIL`.

## 2. Repository GitHub e segreti delle Actions

1. Crea il repository e pubblica:
   ```bash
   cd "D:\Applicazioni\WebDev\Project goal manager"
   git add . && git commit -m "Project Goal Manager 0.2.0"
   gh repo create Nisiix/Project-goal-manager --private --source . --push
   ```
   (il nome `Nisiix/Project-goal-manager` è quello già usato dal sito e dall'updater; se cambi nome aggiorna `Desktop/src-tauri/tauri.conf.json` → `plugins.updater.endpoints`, `Desktop/src/services/branding.ts` → RELEASES_URL e i link in `Web/`.)
2. **Segreti** (Settings → Secrets and variables → Actions → New repository secret):

   | Segreto | Valore | Come ottenerlo |
   |---|---|---|
   | `TAURI_SIGNING_PRIVATE_KEY` | contenuto di `C:\Users\nisos\.tauri\project-goal-manager.key` | `type %USERPROFILE%\.tauri\project-goal-manager.key` e incolla tutto |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | vuoto | la chiave è stata generata senza password |
   | `WINDOWS_CERT_PFX_BASE64` | il certificato OV esportato in `.pfx`, codificato base64 | vedi §3, passo 5 |
   | `WINDOWS_CERT_PASSWORD` | password del `.pfx` | scelta all'esportazione |

   Finché i due segreti del certificato mancano, il workflow salta la firma e produce installer non firmati (SmartScreen avvisa).
3. **GitHub Pages**: Settings → Pages → Source: *GitHub Actions*. Il workflow `site.yml` pubblica `Web/` a ogni push.
4. **Prima release**: `git tag v0.2.0 && git push --tags`. Dopo circa 10 minuti trovi in Releases `.msi`, `-setup.exe`, `latest.json`, `SHA256SUMS.txt`; il sito aggiorna i pulsanti da solo.
5. Verifica l'updater: installa la 0.2.0, poi pubblica una 0.2.1 (bump in `package.json`, `Cargo.toml`, `tauri.conf.json`, nota in `CHANGELOG.md`, tag): all'avvio l'app propone l'aggiornamento.

## 3. Certificato OV per la firma del codice

Perché OV e non altro: Azure Artifact Signing (≈10 $/mese) accetta persone fisiche solo in USA/Canada e aziende con almeno 3 anni; EV costa 300–400 €/anno e dal 2024 non dà più l'esenzione immediata da SmartScreen. Un OV su chiave in cloud è il minimo che firma davvero.

1. **Scegli la CA.** Opzione consigliata: **Certum «Code Signing in the Cloud» (SimplySign)** per sviluppatori europei, circa 110–130 €/anno (rivenditori come SSLmentor offrono 3 anni a ≈350 $). Alternativa: **SSL.com OV** (≈110–130 $/anno) + eSigner cloud (≈180 $/anno): più caro. Entrambe senza token USB.
2. **Documenti.** Come persona fisica: documento d'identità e un selfie/videochiamata di verifica; come ditta individuale/società: visura camerale o partita IVA, documento del legale rappresentante, a volte una bolletta o un numero di telefono verificabile pubblicamente. La CA chiama o scrive per confermare: rispondi entro 24 ore o la pratica si allunga.
3. **Attivazione (Certum).** Installa SimplySign Desktop e l'app mobile SimplySign (token OTP); il certificato vive nel cloud Certum e SimplySign Desktop lo espone a Windows come smart card virtuale: `signtool` e Tauri lo vedono nel certificate store senza altro.
4. **Firma in locale.** Trova l'impronta: `certutil -user -store My` → copia `Cert Hash(sha1)`; poi in `Desktop/src-tauri/tauri.conf.json` aggiungi
   ```json
   "windows": { "certificateThumbprint": "<impronta>", "digestAlgorithm": "sha256", "timestampUrl": "http://time.certum.pl" }
   ```
   dentro `bundle`, e `npm run tauri build` firma `.exe`, `.msi` e setup. Verifica: `signtool verify /pa /v "...-setup.exe"` oppure tasto destro → Proprietà → Firme digitali.
5. **Firma in CI (GitHub).** Con SimplySign la chiave non è esportabile in `.pfx` (è il punto della chiave in cloud): due strade. (a) Firmare in locale e pubblicare la Release a mano (caricare i file firmati); (b) usare un runner self-hosted sul tuo PC con SimplySign attivo (Settings → Actions → Runners → New self-hosted runner) e impostare `runs-on: self-hosted` nel workflow. Con SSL.com eSigner esiste invece un'azione GitHub (`SSLcom/esigner-codesign`) che firma nel cloud: in quel caso i segreti sono username, password, credential id e TOTP di eSigner, non un `.pfx`. Il passo «Importa certificato» nel workflow attuale serve solo se possiedi un `.pfx` esportabile (certificati OV vecchio tipo o aziendali).
6. **SmartScreen.** Anche con la firma, i primi download possono mostrare l'avviso: la reputazione si costruisce con i download firmati dallo stesso certificato nel tempo (settimane). Non cambiare certificato ad ogni rinnovo se la CA permette di rinnovare la stessa chiave.

## 4. Merchant of Record (Paddle) e pulsanti «Acquista»

Perché Paddle: fattura lui al cliente, applica l'IVA del paese dell'acquirente, gestisce rimborsi e chargeback; tu ricevi un bonifico mensile e fatturi a Paddle (reverse charge). Lemon Squeezy è in migrazione verso Stripe Managed Payments: valuta Paddle o, se vuoi restare in Stripe, Stripe Managed Payments quando esce dalla preview.

1. **Prerequisiti pubblici** (Paddle li controlla prima di approvare): sito raggiungibile con prezzi visibili, pagina Termini, Privacy e **politica di rimborso** che nominano Paddle come Merchant of Record, pagina contatti. I Termini attuali (`Web/termini.html`) hanno già rimborso 14 giorni e MoR generico: aggiungi il nome «Paddle.com Market Ltd» quando l'account è approvato.
2. **Account.** paddle.com → Sign up (account sandbox subito, live dopo verifica). Verifica: dominio (invia `projectgoalmanager.app`), identità (passaporto o carta d'identità), dati bancari IBAN per i payout, partita IVA se ce l'hai. Tempi: da 2 giorni a una settimana.
3. **Catalogo.** Crea due prodotti: *Team* e *Business*; per ciascuno due prezzi: annuale (49,90 € / 149,90 €) e mensile (5,90 € / 14,90 €), IVA esclusa, valuta EUR. Copia gli `pri_…` dei prezzi.
4. **Collega il server licenze.** In `tools/license-server/worker.js` compila `PRODUCTS` con gli `pri_…` → piano; `wrangler deploy`; su Paddle → Developer tools → Notifications aggiungi l'URL `https://<worker>/webhook/paddle` per `transaction.completed`, copia il segreto in `wrangler secret put PADDLE_WEBHOOK_SECRET`.
5. **Pulsanti sul sito.** Sostituisci gli `href="mailto:…"` dei pulsanti con `data-checkout` in `Web/index.html` e `Web/en/index.html` con i link di checkout Paddle (Paddle → Checkout → Payment links, uno per prezzo) oppure integra Paddle.js (overlay sul sito). Chiedi al checkout il campo «ragione sociale» (custom field `company`): il Worker lo usa come intestatario.
6. **Prova in sandbox** con la carta di test `4242 4242 4242 4242`: deve arrivare l'email con `license.json` e la licenza deve attivarsi nell'app.
7. **Fisco.** Con il commercialista: regime (forfettario o ordinario), fatturazione a Paddle (soggetto UK/IE: operazione fuori campo IVA o reverse charge a seconda dell'entità), registrazione VIES se serve.

## 5. winget

Dopo la **prima Release firmata** (il manifest punta all'URL dell'installer e al suo SHA-256):

1. Installa lo strumento: `winget install wingetcreate`.
2. Genera il manifest: `wingetcreate new https://github.com/Nisiix/Project-goal-manager/releases/download/v0.2.0/Project.Goal.Manager_0.2.0_x64-setup.exe` e rispondi: PackageIdentifier `Nisos.ProjectGoalManager`, PackageName `Project Goal Manager`, Publisher `Nisos`, License `Proprietary`, ShortDescription (una frase), InstallerType `nullsoft`, Scope `user`, tag `project-management`, `todo`, `roadmap`.
3. Valida e prova: `winget validate <cartella manifest>` e `winget install --manifest <cartella>`.
4. Invia: `wingetcreate submit <cartella>` apre la pull request su `microsoft/winget-pkgs` (serve un account GitHub; la prima volta un bot chiede di accettare il CLA). Revisione automatica + umana: da ore a pochi giorni. Il nome `Nisos.ProjectGoalManager` è già citato sul sito: se scegli un identificatore diverso aggiorna `Web/index.html` e `en/index.html`.
5. Aggiornamenti successivi: `wingetcreate update Nisos.ProjectGoalManager --urls <url nuovo setup> --version 0.2.1 --submit` (si può mettere in CI con un token GitHub).

---

## Fonti

[Microsoft: code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) · [Tauri: Windows code signing](https://v2.tauri.app/distribute/sign/windows/) · [Confronto certificati OV/EV economici (2026)](https://gabrielmoraru.com/obtaining-cheap-ev-ov-certificates-singing-your-application/) · [SSL.com OV code signing](https://www.ssl.com/it/products/software-integrity/code-signing/ov/) · [SSL.com eSigner pricing](https://ssl.com/guide/esigner-pricing-for-code-signing/) · [Paddle: account verification](https://paddle.com/support/what-is-account-verification/) · [Paddle: domain approval](https://www.paddle.com/help/start/account-verification/what-is-domain-approval) · [Paddle: setup checklist](https://developer.paddle.com/build/onboarding/set-up-checklist) · [Lemon Squeezy e Stripe Managed Payments (2026)](https://fungies.io/lemon-squeezy-stripe-acquisition-saas-founders-2026/) · [winget: submit manifest](https://learn.microsoft.com/vi-vn/windows/package-manager/package/repository).
