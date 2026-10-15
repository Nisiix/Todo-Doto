// Emette una licenza firmata (file license.json da copiare nella cartella del workspace).
//
//   node scripts/issue-license.mjs --plan team --to "Studio Rossi" --email info@studiorossi.it
//   node scripts/issue-license.mjs --plan business --seats 40 --to "Acme" --email it@acme.it --years 2
//   node scripts/issue-license.mjs --plan team --to "Studio Bianchi" --email x@y.it --out license.json
//
// Opzioni: --plan team|business   --seats N (default: 10 per Team, illimitati per Business)   --to "intestatario"
//          --email indirizzo       --years N (default 1)
//          --order id ordine       --out file (default: stampa a video)
import { writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { loadSecretKey, signLicense } from './license-lib.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const PLAN_SEATS = { team: 10, business: null } // null = illimitati
const plan = opt('plan')
if (!(plan in PLAN_SEATS)) {
  console.error('Specifica --plan team oppure --plan business.')
  process.exit(1)
}
const to = opt('to')
const email = opt('email')
if (!to || !email) {
  console.error('Servono --to "intestatario" e --email indirizzo.')
  process.exit(1)
}
const seatsOpt = opt('seats', null)
const seats = seatsOpt === null ? PLAN_SEATS[plan] : Number(seatsOpt)
const years = Number(opt('years', 1))
const issuedAt = new Date()
const until = new Date(issuedAt)
until.setFullYear(until.getFullYear() + years)
const day = (d) => d.toISOString().slice(0, 10)

const license = {
  v: 1,
  id: `lic_${randomBytes(6).toString('hex')}`,
  plan,
  seats,
  issuedTo: to,
  email,
  issuedAt: day(issuedAt),
  // Abbonamento annuale: alla scadenza il workspace torna al piano Free.
  expiresAt: day(until),
  order: opt('order', null),
}

const signed = await signLicense(license, loadSecretKey())
const json = JSON.stringify(signed, null, 2)
const out = opt('out')
if (out) {
  writeFileSync(out, json + '\n')
  console.log(`Licenza ${signed.id} (${plan}, ${seats === null ? 'utenti illimitati' : seats + ' utenti'}, fino al ${signed.expiresAt}) scritta in ${out}`)
} else {
  console.log(json)
}
