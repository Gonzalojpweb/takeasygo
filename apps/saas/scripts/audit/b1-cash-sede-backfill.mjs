// ============================================================================
// b1-cash-sede-backfill.mjs — B1 sede en caja, cierres y auditoría
// ============================================================================
// Backfill por fases de locationId en colecciones que lo tienen opcional
// o ausente. Todo detrás del flag `multisede.cashSede` (off por defecto).
//
// Modos (argv[2]):
//   scan           → SOLO LECTURA (default): analiza qué falta por colección
//   apply-auditlogs    → respaldo + backfill AuditLog.locationId
//   apply-zreports     → respaldo + backfill z_report_records.locationId
//   apply-cashsale     → respaldo + backfill cash_sale_events.locationId
//   apply-chopis       → respaldo + asigna Saavedra a los 8 sync_orders de
//                        chopisburger sin sede (marca locationInferred + motivo)
//
// Seguridad:
//   - Los modos apply solo corren contra takeasygo-staging (allowlist).
//   - scan es read-only y funciona contra staging (o prod con --allow-prod).
//   - Cada apply crea un JSON de respaldo en BACKUP_DIR (reversible).
//
// Uso:
//   node scripts/audit/b1-cash-sede-backfill.mjs scan
//   node scripts/audit/b1-cash-sede-backfill.mjs apply-auditlogs
//   MONGODB_URI=... node scripts/audit/b1-cash-sede-backfill.mjs scan --db takeasygo-staging
// ============================================================================

import mongoose from 'mongoose'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'

const STAGING_DB = 'takeasygo-staging'
const mode = process.argv[2] ?? 'scan'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

const argv = process.argv.slice(3)
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

const APPLY_MODES = ['apply-auditlogs', 'apply-zreports', 'apply-cashsale', 'apply-chopis']

function guardStaging() {
  const effective = resolveDbName(uri, dbName)
  if (effective !== STAGING_DB) {
    console.error('')
    console.error('============================================================')
    console.error(`  BLOQUEADO: modo "${mode}" solo corre contra ${STAGING_DB}`)
    console.error(`  Base efectiva: "${effective}"`)
    console.error('============================================================')
    process.exit(2)
  }
  return effective
}

const BACKUP_ROOT =
  process.env.BACKUP_DIR ??
  `${process.env.TEMP}\\opencode\\b1-backup-${new Date().toISOString().slice(0, 10)}`

function backupPath(file) {
  return `${BACKUP_ROOT}\\${file}`
}

function writeBackup(file, data) {
  if (!existsSync(BACKUP_ROOT)) mkdirSync(BACKUP_ROOT, { recursive: true })
  const p = backupPath(file)
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  return p
}

// ---------------------------------------------------------------------------
// SCAN — read-only
// ---------------------------------------------------------------------------
async function scan() {
  guardAgainstProd(uri, dbName, argv)
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const effectiveDb = resolveDbName(uri, dbName)
  const db = mongoose.connection.useDb(effectiveDb).db

  const report = { mode: 'scan', db: effectiveDb, scannedAt: new Date().toISOString() }

  // 1. AuditLog sin locationId
  const auditTotal = await db.collection('auditlogs').countDocuments({})
  const auditWithSede = await db.collection('auditlogs').countDocuments({ locationId: { $ne: null } })
  report.auditlogs = {
    total: auditTotal,
    conSede: auditWithSede,
    sinSede: auditTotal - auditWithSede,
    // Backfillable: logs de caja (entity=CashRegister) → locationId desde CashRegister
    cashEntity: await db.collection('auditlogs').countDocuments({ entity: 'CashRegister' }),
    cashEntitySinSede: await db.collection('auditlogs').countDocuments({ entity: 'CashRegister', locationId: null }),
  }

  // 2. z_report_records sin locationId
  const zTotal = await db.collection('z_report_records').countDocuments({})
  const zWithSede = await db.collection('z_report_records').countDocuments({ locationId: { $ne: null } })
  // Backfillable: join con CashRegister por registerId
  const zBackfillable = await db.collection('z_report_records').aggregate([
    { $lookup: { from: 'cashregisters', localField: 'registerId', foreignField: '_id', as: 'reg' } },
    { $match: { 'reg.0': { $exists: true }, locationId: null } },
    { $count: 'n' },
  ]).toArray()
  report.z_report_records = {
    total: zTotal,
    conSede: zWithSede,
    sinSede: zTotal - zWithSede,
    backfillable: zBackfillable[0]?.n ?? 0,
  }

  // 3. cash_sale_events sin locationId
  const cseTotal = await db.collection('cash_sale_events').countDocuments({})
  const cseWithSede = await db.collection('cash_sale_events').countDocuments({ locationId: { $ne: null } })
  // Backfillable: join con orders por orderId
  const cseBackfillable = await db.collection('cash_sale_events').aggregate([
    { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'ord' } },
    { $match: { 'ord.0': { $exists: true }, locationId: null } },
    { $count: 'n' },
  ]).toArray()
  report.cash_sale_events = {
    total: cseTotal,
    conSede: cseWithSede,
    sinSede: cseTotal - cseWithSede,
    backfillable: cseBackfillable[0]?.n ?? 0,
  }

  // 4. sync_orders chopisburger sin sede
  const chopisTenant = await db.collection('tenants').findOne({ slug: 'chopisburger' })
  if (chopisTenant) {
    const chopisNoSede = await db.collection('sync_orders').countDocuments({
      tenantId: String(chopisTenant._id),
      $or: [{ locationId: null }, { locationId: { $exists: false } }],
    })
    const chopisLocs = await db.collection('locations').find({ tenantId: chopisTenant._id }).toArray()
    report.chopisburger = {
      tenantId: String(chopisTenant._id),
      syncOrdersSinSede: chopisNoSede,
      locations: chopisLocs.map(l => ({ _id: String(l._id), name: l.name })),
    }
  } else {
    report.chopisburger = { error: 'tenant chopisburger no encontrado' }
  }

  // 5. Orders (SaaS) — todos tienen locationId required, solo informativo
  report.orders = {
    total: await db.collection('orders').countDocuments({}),
    sinSede: await db.collection('orders').countDocuments({ locationId: null }),
  }

  console.log(JSON.stringify(report, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: AuditLog.locationId (desde CashRegister.entityId)
// ---------------------------------------------------------------------------
async function applyAuditlogs() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const before = {
    total: await db.collection('auditlogs').countDocuments({}),
    sinSede: await db.collection('auditlogs').countDocuments({ locationId: null }),
  }

  // Backfill: logs de caja con entityId = CashRegister._id → locationId desde CashRegister
  const pipeline = [
    { $match: { entity: 'CashRegister', locationId: null, entityId: { $ne: null } } },
    { $lookup: { from: 'cashregisters', localField: 'entityId', foreignField: '_id', as: 'reg' } },
    { $match: { 'reg.0': { $exists: true } } },
    {
      $project: {
        _id: 1,
        regLocationId: { $arrayElemAt: ['$reg.locationId', 0] },
      },
    },
  ]
  const toUpdate = await db.collection('auditlogs').aggregate(pipeline).toArray()
  if (toUpdate.length === 0) {
    console.log(JSON.stringify({ mode: 'apply-auditlogs', result: 'nada que backfillear', before }))
    await mongoose.disconnect()
    return
  }

  const backup = {
    script: 'b1-cash-sede-backfill.mjs apply-auditlogs',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'backfill AuditLog.locationId desde CashRegister.entityId',
    before,
    count: toUpdate.length,
    docs: toUpdate,
  }
  const p = writeBackup('auditlogs-locationid.json', backup)

  let updated = 0
  for (const doc of toUpdate) {
    const res = await db.collection('auditlogs').updateOne(
      { _id: doc._id },
      { $set: { locationId: doc.regLocationId } }
    )
    updated += res.modifiedCount
  }

  const after = {
    total: await db.collection('auditlogs').countDocuments({}),
    sinSede: await db.collection('auditlogs').countDocuments({ locationId: null }),
  }
  console.log(JSON.stringify({ mode: 'apply-auditlogs', backup: p, updated, before, after }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: z_report_records.locationId (desde CashRegister._id = registerId)
// ---------------------------------------------------------------------------
async function applyZreports() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const before = {
    total: await db.collection('z_report_records').countDocuments({}),
    sinSede: await db.collection('z_report_records').countDocuments({ locationId: null }),
  }

  const pipeline = [
    { $match: { locationId: null } },
    { $lookup: { from: 'cashregisters', localField: 'registerId', foreignField: '_id', as: 'reg' } },
    { $match: { 'reg.0': { $exists: true } } },
    { $project: { _id: 1, regLocationId: { $arrayElemAt: ['$reg.locationId', 0] } } },
  ]
  const toUpdate = await db.collection('z_report_records').aggregate(pipeline).toArray()
  if (toUpdate.length === 0) {
    console.log(JSON.stringify({ mode: 'apply-zreports', result: 'nada que backfillear', before }))
    await mongoose.disconnect()
    return
  }

  const backup = {
    script: 'b1-cash-sede-backfill.mjs apply-zreports',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'backfill z_report_records.locationId desde CashRegister',
    before,
    count: toUpdate.length,
    docs: toUpdate,
  }
  const p = writeBackup('zreports-locationid.json', backup)

  let updated = 0
  for (const doc of toUpdate) {
    const res = await db.collection('z_report_records').updateOne(
      { _id: doc._id },
      { $set: { locationId: doc.regLocationId } }
    )
    updated += res.modifiedCount
  }

  const after = {
    total: await db.collection('z_report_records').countDocuments({}),
    sinSede: await db.collection('z_report_records').countDocuments({ locationId: null }),
  }
  console.log(JSON.stringify({ mode: 'apply-zreports', backup: p, updated, before, after }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: cash_sale_events.locationId (desde Order.locationId)
// ---------------------------------------------------------------------------
async function applyCashsale() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const before = {
    total: await db.collection('cash_sale_events').countDocuments({}),
    sinSede: await db.collection('cash_sale_events').countDocuments({ locationId: null }),
  }

  const pipeline = [
    { $match: { locationId: null } },
    { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'ord' } },
    { $match: { 'ord.0': { $exists: true } } },
    { $project: { _id: 1, ordLocationId: { $arrayElemAt: ['$ord.locationId', 0] } } },
  ]
  const toUpdate = await db.collection('cash_sale_events').aggregate(pipeline).toArray()
  if (toUpdate.length === 0) {
    console.log(JSON.stringify({ mode: 'apply-cashsale', result: 'nada que backfillear', before }))
    await mongoose.disconnect()
    return
  }

  const backup = {
    script: 'b1-cash-sede-backfill.mjs apply-cashsale',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'backfill cash_sale_events.locationId desde Order',
    before,
    count: toUpdate.length,
    docs: toUpdate,
  }
  const p = writeBackup('cashsale-locationid.json', backup)

  let updated = 0
  for (const doc of toUpdate) {
    const res = await db.collection('cash_sale_events').updateOne(
      { _id: doc._id },
      { $set: { locationId: doc.ordLocationId } }
    )
    updated += res.modifiedCount
  }

  const after = {
    total: await db.collection('cash_sale_events').countDocuments({}),
    sinSede: await db.collection('cash_sale_events').countDocuments({ locationId: null }),
  }
  console.log(JSON.stringify({ mode: 'apply-cashsale', backup: p, updated, before, after }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: chopisburger sync_orders sin sede → Saavedra
// ---------------------------------------------------------------------------
async function applyChopis() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const chopisTenant = await db.collection('tenants').findOne({ slug: 'chopisburger' })
  if (!chopisTenant) {
    console.error('Tenant chopisburger no encontrado.')
    process.exit(3)
  }

  const locations = await db.collection('locations').find({ tenantId: chopisTenant._id }).toArray()
  const saavedra = locations.find(l => /saavedra/i.test(l.name))
  if (!saavedra) {
    console.error('No se encontró la sede Saavedra de chopisburger. Locations:', locations.map(l => l.name))
    process.exit(3)
  }

  const toUpdate = await db.collection('sync_orders').find({
    tenantId: String(chopisTenant._id),
    $or: [{ locationId: null }, { locationId: { $exists: false } }],
  }).toArray()

  if (toUpdate.length === 0) {
    console.log(JSON.stringify({ mode: 'apply-chopis', result: 'nada que asignar' }))
    await mongoose.disconnect()
    return
  }

  const REASON = 'Backfill B1: sede inferida por exclusión — chopisburger es multi-sede (Recoleta propia / Saavedra ajena); estas órdenes sin sede se asignan a Saavedra por decisión de Gonzalo (2026-10-13).'

  const backup = {
    script: 'b1-cash-sede-backfill.mjs apply-chopis',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'asignar Saavedra a sync_orders chopisburger sin sede',
    targetLocation: { _id: String(saavedra._id), name: saavedra.name },
    reason: REASON,
    count: toUpdate.length,
    docs: toUpdate.map(d => ({ _id: d._id, externalOrderId: d.externalOrderId, createdAt: d.createdAt, locationId: d.locationId ?? null })),
  }
  const p = writeBackup('chopis-syncorders-saavedra.json', backup)

  let updated = 0
  for (const doc of toUpdate) {
    const res = await db.collection('sync_orders').updateOne(
      { _id: doc._id },
      {
        $set: {
          locationId: String(saavedra._id),
          locationInferred: true,
          locationInferenceReason: REASON,
        },
      }
    )
    updated += res.modifiedCount
  }

  const after = {
    sinSede: await db.collection('sync_orders').countDocuments({
      tenantId: String(chopisTenant._id),
      $or: [{ locationId: null }, { locationId: { $exists: false } }],
    }),
    conSedeInferida: await db.collection('sync_orders').countDocuments({
      tenantId: String(chopisTenant._id),
      locationInferred: true,
    }),
  }
  console.log(JSON.stringify({ mode: 'apply-chopis', backup: p, updated, target: saavedra.name, before: { sinSede: toUpdate.length }, after }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const runners = {
  scan,
  'apply-auditlogs': applyAuditlogs,
  'apply-zreports': applyZreports,
  'apply-cashsale': applyCashsale,
  'apply-chopis': applyChopis,
}

const runner = runners[mode]
if (!runner) {
  console.error(`Modo desconocido: "${mode}". Modos válidos: ${Object.keys(runners).join(', ')}`)
  process.exit(1)
}

runner().catch(err => {
  console.error(err)
  process.exit(1)
})
