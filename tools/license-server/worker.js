/**
 * Server licenze: un Cloudflare Worker (piano gratuito) che riceve il webhook
 * «ordine pagato» del Merchant of Record, firma una licenza Ed25519 e la invia
 * per email al cliente. Nessun database: la firma basta, e la stessa licenza
 * può essere rigenerata dai dati dell'ordine.
 *
 * Rotte
 *   POST /webhook/paddle        webhook Paddle (transaction.completed)
 *   POST /webhook/lemonsqueezy  webhook Lemon Squeezy (order_created)
 *   POST /issue                 emissione manuale: header "Authorization: Bearer <ADMIN_TOKEN>",
 *                               body { plan, seats?, to, email, years?, order? } → license.json
 *
 * Variabili (wrangler secret put …)
 *   LICENSE_SIGNING_KEY   chiave privata hex (contenuto di ~/.pgm/license-signing.key)
 *   ADMIN_TOKEN           token per /issue
 *   PADDLE_WEBHOOK_SECRET / LEMONSQUEEZY_WEBHOOK_SECRET   segreti dei webhook
 *   RESEND_API_KEY        per inviare l'email (https://resend.com, 3.000 email/mese gratis)
 *   FROM_EMAIL            es. "Project Goal Manager <licenze@projectgoalmanager.app>"
 *
 * Mappa prodotto → piano: PRODUCTS qui sotto (id prodotto/price del MoR).
 */
import * as ed from '@noble/ed25519'

const PRODUCTS = {
  // 'pri_01xxxx': { plan: 'team', seats: 10, years: 1 },
  // 'pri_01yyyy': { plan: 'business', seats: null, years: 1 },
}
const PLAN_SEATS = { team: 10, business: null } // null = illimitati

// --- firma (identica a Desktop/scripts/license-lib.mjs) ---------------------
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
const fromHex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)))
const b64 = (bytes) => btoa(String.fromCharCode(...bytes))
const day = (d) => d.toISOString().slice(0, 10)

async function issue(env, { plan, seats, to, email, years = 1, order = null }) {
  if (!(plan in PLAN_SEATS)) throw new Error('piano sconosciuto')
  const issuedAt = new Date()
  const until = new Date(issuedAt)
  until.setFullYear(until.getFullYear() + Number(years))
  const license = {
    v: 1,
    id: 'lic_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    plan,
    seats: seats === undefined || seats === null ? PLAN_SEATS[plan] : Number(seats),
    issuedTo: String(to),
    email: String(email),
    issuedAt: day(issuedAt),
    expiresAt: day(until),
    order,
  }
  const sig = await ed.signAsync(new TextEncoder().encode(canonical(license)), fromHex(env.LICENSE_SIGNING_KEY))
  return { ...license, sig: b64(sig) }
}

async function sendEmail(env, license) {
  if (!env.RESEND_API_KEY) return
  const json = JSON.stringify(license, null, 2)
  const text = [
    `Grazie per aver scelto Project Goal Manager.`,
    ``,
    `Piano ${license.plan === 'team' ? 'Team' : 'Business'} · ${license.seats === null ? 'utenti illimitati' : license.seats + ' utenti'} · valida fino al ${license.expiresAt}`,
    ``,
    `Per attivarla: apri il workspace → menu del workspace → «Piano e licenza» → incolla il testo qui sotto (oppure salva l'allegato license.json nella cartella del workspace).`,
    ``,
    json,
    ``,
    `La licenza vale per un workspace (una cartella) e per tutti i suoi membri. Conserva questa email.`,
  ].join('\n')
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [license.email],
      subject: `La tua licenza Project Goal Manager (${license.id})`,
      text,
      attachments: [{ filename: 'license.json', content: btoa(unescape(encodeURIComponent(json))) }],
    }),
  })
}

// --- verifica firma dei webhook ---------------------------------------------
async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Paddle: header "Paddle-Signature: ts=…;h1=…", firma HMAC-SHA256 di "ts:body". */
async function verifyPaddle(req, body, env) {
  const header = req.headers.get('Paddle-Signature') || ''
  const parts = Object.fromEntries(header.split(';').map((p) => p.split('=')))
  if (!parts.ts || !parts.h1) return false
  const expected = await hmacHex(env.PADDLE_WEBHOOK_SECRET, `${parts.ts}:${body}`)
  return expected === parts.h1
}

/** Lemon Squeezy: header "X-Signature", HMAC-SHA256 del body. */
async function verifyLemon(req, body, env) {
  const sig = req.headers.get('X-Signature') || ''
  return (await hmacHex(env.LEMONSQUEEZY_WEBHOOK_SECRET, body)) === sig
}

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json' } })

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (req.method !== 'POST') return new Response('Project Goal Manager · server licenze', { status: 200 })
    const body = await req.text()

    if (url.pathname === '/issue') {
      if (req.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'non autorizzato' }, 401)
      const lic = await issue(env, JSON.parse(body))
      if (JSON.parse(body).sendEmail) await sendEmail(env, lic)
      return json(lic)
    }

    if (url.pathname === '/webhook/paddle') {
      if (!(await verifyPaddle(req, body, env))) return json({ error: 'firma non valida' }, 401)
      const ev = JSON.parse(body)
      if (ev.event_type !== 'transaction.completed') return json({ ok: true, ignored: ev.event_type })
      const d = ev.data
      for (const item of d.items || []) {
        const product = PRODUCTS[item.price?.id]
        if (!product) continue
        const lic = await issue(env, {
          ...product,
          to: d.custom_data?.company || d.customer?.name || d.customer?.email || 'Cliente',
          email: d.customer?.email || d.custom_data?.email,
          order: d.id,
        })
        await sendEmail(env, lic)
      }
      return json({ ok: true })
    }

    if (url.pathname === '/webhook/lemonsqueezy') {
      if (!(await verifyLemon(req, body, env))) return json({ error: 'firma non valida' }, 401)
      const ev = JSON.parse(body)
      if (ev.meta?.event_name !== 'order_created') return json({ ok: true, ignored: ev.meta?.event_name })
      const a = ev.data?.attributes || {}
      const product = PRODUCTS[String(a.first_order_item?.variant_id)]
      if (!product) return json({ ok: true, ignored: 'prodotto non mappato' })
      const lic = await issue(env, { ...product, to: a.user_name || a.user_email, email: a.user_email, order: String(a.order_number) })
      await sendEmail(env, lic)
      return json({ ok: true })
    }

    return json({ error: 'rotta sconosciuta' }, 404)
  },
}
