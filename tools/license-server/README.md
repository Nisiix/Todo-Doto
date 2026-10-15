# Server licenze

Un Cloudflare Worker che trasforma un ordine pagato in una licenza firmata e la invia per email. Niente database: la licenza è un file JSON con firma Ed25519, verificata dall'app in locale.

## Come funziona

```
cliente paga sul checkout del MoR (Paddle / Lemon Squeezy)
        │  webhook "ordine completato"
        ▼
Worker: verifica la firma del webhook → mappa prodotto → piano
        → firma license.json con la chiave privata → email (Resend) con il file
        ▼
cliente: Piano e licenza → incolla / scegli file → license.json nella cartella del workspace
```

Lo stesso file si può emettere a mano, senza Worker, con `node Desktop/scripts/issue-license.mjs` (stessa chiave).

## Messa in opera (una volta)

1. `npm create cloudflare@latest license-server` (o `wrangler init`), copia `worker.js` come entry e aggiungi la dipendenza `@noble/ed25519`.
2. Segreti:
   ```bash
   wrangler secret put LICENSE_SIGNING_KEY      # contenuto di ~/.pgm/license-signing.key
   wrangler secret put ADMIN_TOKEN              # stringa lunga casuale
   wrangler secret put PADDLE_WEBHOOK_SECRET    # dal pannello Paddle → Notifications
   wrangler secret put RESEND_API_KEY
   wrangler secret put FROM_EMAIL               # es. "Project Goal Manager <licenze@tuodominio>"
   ```
3. In `PRODUCTS` (in `worker.js`) mappa gli id dei prezzi del MoR ai piani (team/business, posti, anni).
4. `wrangler deploy`, poi registra l'URL `https://<worker>/webhook/paddle` nel MoR per l'evento `transaction.completed` (Lemon Squeezy: `order_created` su `/webhook/lemonsqueezy`).
5. Prova con il sandbox del MoR: l'email con `license.json` deve arrivare e attivarsi nell'app.

## Emissione manuale (beta tester, vendite dirette)

```bash
curl -X POST https://<worker>/issue -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"plan":"team","to":"Studio Rossi","email":"info@studiorossi.it","years":1,"sendEmail":true}'
```

oppure in locale: `node Desktop/scripts/issue-license.mjs --plan team --to "Studio Rossi" --email info@studiorossi.it --out license.json`.

## Sicurezza

- La chiave privata esiste solo in `~/.pgm/license-signing.key` e nei segreti del Worker. Se la perdi, rigenera con `--force` e ricompila l'app con la nuova chiave pubblica: le licenze vecchie non saranno più valide.
- La verifica nell'app è offline per scelta (LAN chiuse): il file è un deterrente, non un DRM. Una PMI non lo aggira; chi vuole aggirarlo non era un cliente.
