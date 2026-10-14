// ============================================================================
// mp-complete-pending-accountid.mjs — Completar mpAccountId de pagos pendientes
// ============================================================================
// ANTES de habilitar mp.perLocation, toda orden/reserva pendiente debe tener
// payment.mpAccountId seteado. El webhook usa ese campo como fuente de verdad;
// si es null, cae al fallback por firma que no funciona con múltiples cuentas.
//
// El script:
//   1. Busca órdenes/reservas con payment.mpAccountId null o ausente
//   2. Para cada una, resuelve la cuenta según la config ACTUAL del tenant
//      (antes del cambio de modo)
//   3. Setea payment.mpAccountId
//
// Modos (argv[2]):
//   scan    → SOLO LECTURA: lista órdenes/reservas sin mpAccountId
//   apply   → setea mpAccountId en las que falten
//
// Uso:
//   MONGODB_URI=... node scripts/audit/mp-complete-pending-accountid.mjs scan
//   MONGODB_URI=... node scripts/audit/mp-complete-pending-accountid.mjs apply --tenant <slug>
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
const tenantArgIdx = argv.indexOf('--tenant')
const tenantSlug = tenantArgIdx >= 0 ? argv[tenantArgIdx + 1] : null

async function main() {
  guardAgainstProd(uri, dbName, argv)
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const effectiveDb = resolveDbName(uri, dbName)
  const db = mongoose.connection.useDb(effectiveDb).db

  const report = { mode, db: effectiveDb, startedAt: new Date().toISOString() }

  // Filtro de tenant (opcional)
  const tenantFilter = tenantSlug ? { slug: tenantSlug } : {}
  const tenants = await db.collection('tenants').find(tenantFilter).toArray()
  report.tenantsScanned = tenants.length

  // ── Órdenes pendientes sin mpAccountId ─────────────────────────────
  // "Pendientes" = sin pago confirmado y sin mpAccountId seteado
  const pendingOrders = await db.collection('orders').aggregate([
    {
      $match: {
        ...(tenantSlug ? { tenantId: { $in: tenants.map(t => t._id) } } : {}),
        $or: [
          { 'payment.mpAccountId': null },
          { 'payment.mpAccountId': { $exists: false } },
        ],
        status: { $nin: ['delivered', 'cancelled'] },
        deletedAt: null,
      },
    },
    {
      $project: {
        tenantId: 1,
        locationId: 1,
        orderNumber: 1,
        status: 1,
        'payment.mpAccountId': 1,
        'payment.method': 1,
      },
    },
  ]).toArray()

  report.pendingOrders = {
    total: pendingOrders.length,
    porTenant: {},
    ejemplos: pendingOrders.slice(0, 20).map(o => ({
      orderNumber: o.orderNumber,
      tenantId: String(o.tenantId),
      locationId: o.locationId ? String(o.locationId) : null,
      status: o.status,
      method: o.payment?.method,
    })),
  }

  // Agrupar por tenant para el reporte
  for (const o of pendingOrders) {
    const tid = String(o.tenantId)
    report.pendingOrders.porTenant[tid] = (report.pendingOrders.porTenant[tid] ?? 0) + 1
  }

  // ── Reservas pendientes sin mpAccountId ────────────────────────────
  const pendingReservations = await db.collection('reservations').aggregate([
    {
      $match: {
        ...(tenantSlug ? { tenantId: { $in: tenants.map(t => t._id) } } : {}),
        $or: [
          { 'payment.mpAccountId': null },
          { 'payment.mpAccountId': { $exists: false } },
        ],
        status: { $nin: ['cancelled', 'no_show'] },
      },
    },
    {
      $project: {
        tenantId: 1,
        locationId: 1,
        reservationNumber: 1,
        status: 1,
        'payment.mpAccountId': 1,
      },
    },
  ]).toArray()

  report.pendingReservations = {
    total: pendingReservations.length,
    porTenant: {},
    ejemplos: pendingReservations.slice(0, 20).map(r => ({
      reservationNumber: r.reservationNumber,
      tenantId: String(r.tenantId),
      locationId: r.locationId ? String(r.locationId) : null,
      status: r.status,
    })),
  }

  for (const r of pendingReservations) {
    const tid = String(r.tenantId)
    report.pendingReservations.porTenant[tid] = (report.pendingReservations.porTenant[tid] ?? 0) + 1
  }

  if (mode === 'scan') {
    console.log(JSON.stringify(report, null, 2))
    await mongoose.disconnect()
    return
  }

  // ── APPLY: setear mpAccountId ──────────────────────────────────────
  let ordersUpdated = 0
  let reservationsUpdated = 0
  let ordersFailed = 0
  let reservationsFailed = 0

  // Helper: resolver cuenta activa de un tenant (misma lógica que lib/mercadopago)
  function resolveActiveAccountId(tenantDoc) {
    if (tenantDoc.mpAccounts?.length) {
      const active = tenantDoc.mpAccounts.find(a => a.isActive)
      return active?._id?.toString() ?? null
    }
    if (tenantDoc.mercadopago?.isConfigured && tenantDoc.mercadopago?.accessToken) {
      return 'legacy'
    }
    return null
  }

  const tenantMap = new Map(tenants.map(t => [String(t._id), t]))

  for (const o of pendingOrders) {
    const tenantDoc = tenantMap.get(String(o.tenantId))
    if (!tenantDoc) { ordersFailed++; continue }
    const accountId = resolveActiveAccountId(tenantDoc)
    if (!accountId) { ordersFailed++; continue }

    try {
      await db.collection('orders').updateOne(
        { _id: o._id },
        { $set: { 'payment.mpAccountId': accountId } }
      )
      ordersUpdated++
    } catch { ordersFailed++ }
  }

  for (const r of pendingReservations) {
    const tenantDoc = tenantMap.get(String(r.tenantId))
    if (!tenantDoc) { reservationsFailed++; continue }
    const accountId = resolveActiveAccountId(tenantDoc)
    if (!accountId) { reservationsFailed++; continue }

    try {
      await db.collection('reservations').updateOne(
        { _id: r._id },
        { $set: { 'payment.mpAccountId': accountId } }
      )
      reservationsUpdated++
    } catch { reservationsFailed++ }
  }

  report.applyResult = {
    ordersUpdated,
    ordersFailed,
    reservationsUpdated,
    reservationsFailed,
  }

  console.log(JSON.stringify(report, null, 2))
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
