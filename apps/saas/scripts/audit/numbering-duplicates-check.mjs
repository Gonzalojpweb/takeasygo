// ============================================================================
// numbering-duplicates-check.mjs — Chequeo previo a índices únicos
// ============================================================================
// ANTES de crear cualquier índice único sobre orderNumber o
// reservationNumber, buscar duplicados existentes y reportarlos.
//
// Modos (argv[2]):
//   scan   → SOLO LECTURA (default): busca duplicados en staging/prod
//
// Uso:
//   MONGODB_URI=... node scripts/audit/numbering-duplicates-check.mjs scan
// ============================================================================

import mongoose from 'mongoose'
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

async function scan() {
  guardAgainstProd(uri, dbName, argv)
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const effectiveDb = resolveDbName(uri, dbName)
  const db = mongoose.connection.useDb(effectiveDb).db

  const report = { mode: 'scan', db: effectiveDb, scannedAt: new Date().toISOString() }

  // ── orderNumber duplicados (mismo tenant) ──────────────────────────
  const orderDupes = await db.collection('orders').aggregate([
    { $group: { _id: { tenantId: '$tenantId', orderNumber: '$orderNumber' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()
  report.orderNumber = {
    total: await db.collection('orders').countDocuments({}),
    duplicadosMismoTenant: orderDupes.length,
    ejemplos: orderDupes.slice(0, 10).map(d => ({
      tenantId: String(d._id.tenantId),
      orderNumber: d._id.orderNumber,
      count: d.count,
      ids: d.ids.map(String),
    })),
    indiceUnicoDeclarado: true,
  }

  // ── reservationNumber duplicados (mismo tenant) ────────────────────
  const resDupes = await db.collection('reservations').aggregate([
    { $group: { _id: { tenantId: '$tenantId', reservationNumber: '$reservationNumber' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()
  report.reservationNumber = {
    total: await db.collection('reservations').countDocuments({}),
    duplicadosMismoTenant: resDupes.length,
    ejemplos: resDupes.slice(0, 10).map(d => ({
      tenantId: String(d._id.tenantId),
      reservationNumber: d._id.reservationNumber,
      count: d.count,
      ids: d.ids.map(String),
    })),
    indiceUnicoDeclarado: false,
  }

  // ── Formatos existentes (informativo) ──────────────────────────────
  const orderFormats = await db.collection('orders').aggregate([
    {
      $project: {
        fmt: {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: '$orderNumber', regex: /^[A-Z]{3}-\d{6}-\d{4}$/ } }, then: 'SLUG-AAMMDD-NNNN (legacy)' },
              { case: { $regexMatch: { input: '$orderNumber', regex: /^[A-Z]{2,4}-\d{4}$/ } }, then: 'PREFIX-NNNN (perLocation)' },
            ],
            default: 'otro',
          },
        },
      },
    },
    { $group: { _id: '$fmt', count: { $sum: 1 } } },
  ]).toArray()
  report.orderFormats = Object.fromEntries(orderFormats.map(f => [f._id, f.count]))

  const resFormats = await db.collection('reservations').aggregate([
    {
      $project: {
        fmt: {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: '$reservationNumber', regex: /^R\d+$/ } }, then: 'RNNNN (legacy)' },
              { case: { $regexMatch: { input: '$reservationNumber', regex: /^[A-Z]{2,4}-R\d+$/ } }, then: 'PREFIX-RNNNN (perLocation)' },
            ],
            default: 'otro',
          },
        },
      },
    },
    { $group: { _id: '$fmt', count: { $sum: 1 } } },
  ]).toArray()
  report.reservationFormats = Object.fromEntries(resFormats.map(f => [f._id, f.count]))

  console.log(JSON.stringify(report, null, 2))
  await mongoose.disconnect()
}

if (mode !== 'scan') {
  console.error(`Modo desconocido: "${mode}". Válido: scan`)
  process.exit(1)
}

scan().catch(err => {
  console.error(err)
  process.exit(1)
})
