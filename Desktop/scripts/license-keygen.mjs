// Genera la coppia di chiavi Ed25519 con cui si firmano le licenze.
//   node scripts/license-keygen.mjs            (rifiuta di sovrascrivere)
//   node scripts/license-keygen.mjs --force
// La chiave privata resta in ~/.pgm/license-signing.key (fuori dal repository):
// chi la possiede può emettere licenze valide. La pubblica va incollata in
// src/services/license.ts (LICENSE_PUBLIC_KEY) e nel server licenze.
import * as ed from '@noble/ed25519'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { KEY_DIR, PUBLIC_KEY_FILE, SECRET_KEY_FILE, hex } from './license-lib.mjs'

const force = process.argv.includes('--force')
if (existsSync(SECRET_KEY_FILE) && !force) {
  console.error(`Esiste già una chiave in ${SECRET_KEY_FILE}. Usa --force per sostituirla (le licenze già emesse non saranno più valide).`)
  process.exit(1)
}
mkdirSync(KEY_DIR, { recursive: true })
const { secretKey, publicKey } = await ed.keygenAsync()
writeFileSync(SECRET_KEY_FILE, hex(secretKey) + '\n', { mode: 0o600 })
writeFileSync(PUBLIC_KEY_FILE, hex(publicKey) + '\n')
console.log(`Chiave privata: ${SECRET_KEY_FILE}  (tienila segreta, fai un backup)`)
console.log(`Chiave pubblica: ${hex(publicKey)}`)
