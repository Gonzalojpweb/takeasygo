// ============================================================================
// migrate-numbering-indexes.mjs — Migración de índices únicos de numeración
// ============================================================================
// ANTES (viejo): unique global en orderNumber (rompería con per-location)
// DESPUÉS (nuevo):
//   orders:      unique en (tenantId, orderNumber)
//   reservations: unique en (tenantId, locationId, reservationNumber)
//
// El script:
//   1. Verifica que no haya duplicados (tenant, número) en orders
//   2. Verifica que no haya duplicados (tenant, sede, número) en reservations
//   3. Drop el índice viejo de orderNumber si existe
//   4. Crea los índices nuevos
//
// Modos (argv[2]):
//   scan    → solo verifica duplicados (no toca índices)
//   apply   → verifica + migra índices (requiere confirmación interactiva)
//
// Uso:
//   MONGODB_URI=... node scripts/audit/migrate-numbering-indexes.mjs scan
//   MONGODB_URI=... node scripts/audit/migrate-numbering-indexes.mjs apply
// ============================================================================

import mongoose from 'mongoose'
import readline from 'readline'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'

const mode = process.argv[2] ?? 'scan'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

const argv = process.argv.slice(3)
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'si' || answer.trim().toLowerCase() === 's')
    })
  })
}

async function main() {
  guardAgainstProd(uri, dbName, argv)
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const effectiveDb = resolveDbName(uri, dbName)
  const db = mongoose.connection.useDb(effectiveDb).db

  const report = { mode, db: effectiveDb, startedAt: new Date().toISOString() }

  // ── 1. Verificar duplicados orders (tenantId, orderNumber) ─────────
  const orderDupes = await db.collection('orders').aggregate([
    { $group: { _id: { tenantId: '$tenantId', orderNumber: '$orderNumber' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray()
  report.ordersDupes = orderDupes.length

  // ── 2. Verificar duplicados reservations (tenantId, locationId, reservationNumber) ──
  const resDupes = await db.collection('reservations').aggregate([
    { $group: { _id: { tenantId: '$tenantId', locationId: '$locationId', reservationNumber: '$reservationNumber' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray()
  report.reservationsDupes = resDupes.length

  if (orderDupes.length > 0 || resDupes.length > 0) {
    console.error('BLOQUEADO: hay duplicados. Resolverlos antes de crear índices únicos.')
    console.error(JSON.stringify({ ordersDupes: orderDupes.length, reservationsDupes: resDupes.length }, null, 2))
    await mongoose.disconnect()
    process.exit(1)
  }

  // ── 3. Índices existentes ──────────────────────────────────────────
  const orderIndexes = await db.collection('orders').indexes()
  const resIndexes = await db.collection('reservations').indexes()

  report.orderIndexesAntes = orderIndexes.map(i => ({ name: i.name, key: i.key, unique: !!i.unique }))
  report.reservationIndexesAntes = resIndexes.map(i => ({ name: i.name, key: i.key, unique: !!i.unique }))

  const hasOldOrderUnique = orderIndexes.some(i => i.unique && i.key.orderNumber === 1 && !i.key.tenantId)
  const hasNewOrderUnique = orderIndexes.some(i => i.unique && i.key.tenantId === 1 && i.key.orderNumber === 1)
  const hasNewResUnique = resIndexes.some(i => i.unique && i.key.tenantId === 1 && i.key.locationId === 1 && i.key.reservationNumber === 1)

  report.estado = {
    oldOrderUnique: hasOldOrderUnique,
    newOrderUnique: hasNewOrderUnique,
    newReservationUnique: hasNewResUnique,
  }

  if (mode === 'scan') {
    console.log(JSON.stringify(report, null, 2))
    await mongoose.disconnect()
    return
  }

  // ── 4. APPLY: migrar índices ───────────────────────────────────────
  console.log(JSON.stringify(report, null, 2))
  console.log('')
  const ok = await confirm('¿Ejecutar migración de índices? (escribí "si"): ')
  if (!ok) {
    console.log('Cancelado.')
    await mongoose.disconnect()
    return
  }

  // Drop índice viejo global en orderNumber
  if (hasOldOrderUnique) {
    await db.collection('orders').dropIndex('orderNumber_1')
    report.droppedOldOrderIndex = true
    console.log('Drop índice viejo orderNumber_1 ✓')
  }

  // Crear índice nuevo orders
  if (!hasNewOrderUnique) {
    await db.collection('orders').createIndex(
      { tenantId: 1, orderNumber: 1 },
      { unique: true, name: 'uniq_tenant_ordernumber' }
    )
    report.createdOrderIndex = true
    console.log('Create índice uniq_tenant_ordernumber ✓')
  }

  // Crear índice nuevo reservations
  if (!hasNewResUnique) {
    await db.collection('reservations').createIndex(
      { tenantId: 1, locationId: 1, reservationNumber: 1 },
      { unique: true, name: 'uniq_tenant_sede_resnumber' }
    )
    report.createdReservationIndex = true
    console.log('Create índice uniq_tenant_sede_resnumber ✓')
  }

  // Verificar índices después
  const orderIndexesAfter = await db.collection('orders').indexes()
  const resIndexesAfter = await db.collection('reservations').indexes()
  report.orderIndexesDespues = orderIndexesAfter.map(i => ({ name: i.name, key: i.key, unique: !!i.unique }))
  report.reservationIndexesDespues = resIndexesAfter.map(i => ({ name: i.name, key: i.key, unique: !!i.unique }))

  console.log('')
  console.log(JSON.stringify(report, null, 2))
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
