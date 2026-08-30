/**
 * Backfill idempotente — QrPromo.locationId (item A)
 *
 * Asigna `locationId: null` a todas las promos scope:'tenant' que NO tengan
 * el campo (legacy). null = "todas las sedes", elección explícita del admin.
 * No toca promos scope:'global'.
 *
 * SAFETY: se niega a correr salvo que el nombre de la base contenga 'staging'
 * o empiece con '__' (DBs de test local). Nunca contra producción.
 *
 * Ejecución:
 *   npx tsx --env-file=apps/saas/.env.staging apps/saas/scripts/backfill-qr-promo-location.ts
 *   npx tsx apps/saas/scripts/backfill-qr-promo-location.ts   (lee .env.local)
 */

import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function uriFromEnvFile(file: string): string {
  if (!existsSync(file)) return ''
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

async function main() {
  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve(__dirname, '../.env.staging'))
  if (!uri) uri = uriFromEnvFile(resolve(__dirname, '../.env.local'))
  if (!uri) {
    console.error('ABORT: MONGODB_URI no encontrada (env, .env.staging o .env.local)')
    process.exit(2)
  }

  const path = uri.split('?')[0]
  const dbName = path.slice(path.lastIndexOf('/') + 1)
  const allowed = dbName.startsWith('__') || dbName.includes('staging')
  if (!allowed) {
    console.error(`ABORT: base "${dbName}" no es staging ni test local. Refusing to run.`)
    process.exit(2)
  }

  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })

  const QrPromo = mongoose.connection.db!.collection('qrpromos')
  const filter = { scope: 'tenant', locationId: { $exists: false } }

  const before = await QrPromo.countDocuments(filter)
  console.log(`[backfill] db="${dbName}" promos legacy sin locationId: ${before}`)

  if (before === 0) {
    console.log('[backfill] Nada que hacer. (idempotente)')
  } else {
    const res = await QrPromo.updateMany(filter, { $set: { locationId: null } })
    console.log(`[backfill] actualizadas: ${res.modifiedCount}`)
  }

  const after = await QrPromo.countDocuments(filter)
  const remaining = await QrPromo.countDocuments({ scope: 'tenant', locationId: { $ne: null } })
  console.log(`[backfill] restantes sin locationId: ${after}; con sede asignada: ${remaining}`)
  console.log('[backfill] OK')

  await mongoose.disconnect()
  process.exit(after === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('[backfill] fatal:', err)
  process.exit(1)
})