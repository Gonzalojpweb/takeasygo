/**
 * Migración TGO Inventory v1 → v2 (idempotente)
 * ============================================================================
 * Ejecutar ANTES (o inmediatamente después) del deploy de v2:
 *
 *   npx tsx apps/saas/scripts/inventory-migrate-v2.ts            ← simulación
 *   npx tsx apps/saas/scripts/inventory-migrate-v2.ts --apply    ← ejecuta
 *
 * Lee MONGODB_URI del entorno o de apps/saas/.env.local.
 *
 * Qué hace:
 *   1. inventory_skus: completa `nameKey` (nombre normalizado) y `kind`. Si un
 *      tenant tiene dos insumos con el mismo nombre normalizado, lo REPORTA
 *      y no crea el índice único hasta que se resuelva a mano.
 *   2. inventory_ledger: completa `locationId` (sede) desde el depósito en
 *      eventos v1 — es metadata derivada, no altera ningún hecho — y cambia
 *      el índice único global de eventId por uno por tenant.
 *   3. inventory_state / inventory_state_snapshots: cachés derivadas. Se
 *      eliminan SOLO los documentos v1; el estado se regenera desde el ledger con
 *      POST /api/[tenant]/inventory/rebuild (o solo, con el próximo evento).
 *   4. Reporta colecciones v1 que ya no se usan (sku_menu_links,
 *      unit_equivalences): NO se borran.
 *   5. Crea los índices v2.
 */

import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const APPLY = process.argv.includes('--apply')

function uriFromEnvFile(file: string): string {
  if (!existsSync(file)) return ''
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

async function dropIndexIfExists(coll: mongoose.mongo.Collection, name: string) {
  const exists = (await coll.indexes()).some((i) => i.name === name)
  if (!exists) return
  console.log(`  · índice obsoleto ${coll.collectionName}.${name}${APPLY ? ' → eliminado' : ' (se eliminaría)'}`)
  if (APPLY) await coll.dropIndex(name)
}

async function main() {
  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) {
    console.error('No se encontró MONGODB_URI')
    process.exit(1)
  }
  await mongoose.connect(uri)
  const db = mongoose.connection.db!
  console.log(`Base: ${db.databaseName} · modo ${APPLY ? 'APLICAR' : 'SIMULACIÓN (usar --apply para ejecutar)'}\n`)

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name))
  const coll = (name: string) => db.collection(name)

  // 1. Insumos ───────────────────────────────────────────────────────────────
  console.log('1. inventory_skus')
  const duplicates: string[] = []
  if (existing.has('inventory_skus')) {
    const skus = await coll('inventory_skus').find({}).project({ tenantId: 1, name: 1, nameKey: 1, kind: 1 }).toArray()
    const seen = new Map<string, string>()
    let toFix = 0
    for (const s of skus) {
      const key = normalizeName(String(s.name ?? ''))
      const scoped = `${s.tenantId}|${key}`
      if (seen.has(scoped)) duplicates.push(`tenant ${s.tenantId}: "${s.name}" duplica a ${seen.get(scoped)}`)
      else seen.set(scoped, String(s._id))
      if (s.nameKey !== key || !s.kind) {
        toFix++
        if (APPLY) await coll('inventory_skus').updateOne({ _id: s._id }, { $set: { nameKey: key, ...(s.kind ? {} : { kind: 'raw' }) } })
      }
    }
    console.log(`  · ${skus.length} insumos, ${toFix} sin nameKey/kind${APPLY ? ' → completados' : ''}`)
    for (const d of duplicates) console.log(`  ! DUPLICADO (resolver a mano): ${d}`)
  }

  // 2. Ledger ────────────────────────────────────────────────────────────────
  console.log('\n2. inventory_ledger')
  if (existing.has('inventory_ledger')) {
    const ledger = coll('inventory_ledger')
    const total = await ledger.countDocuments()
    const missing = await ledger.countDocuments({ $or: [{ locationId: { $exists: false } }, { locationId: null }], storageLocationId: { $ne: null } })
    console.log(`  · ${total} eventos; ${missing} sin sede`)
    if (APPLY && missing > 0) {
      const storages = await coll('inventory_storage_locations').find({}).project({ locationId: 1 }).toArray()
      for (const st of storages) {
        await ledger.updateMany(
          { storageLocationId: st._id, $or: [{ locationId: { $exists: false } }, { locationId: null }] },
          { $set: { locationId: st.locationId } },
        )
      }
      console.log('  · sede completada desde el depósito (metadata, los hechos no cambian)')
    }
    const legacy = await ledger.aggregate([
      { $match: { eventType: { $in: ['UnitEquivalenceLearned', 'ModelCalibrated', 'SaleConsumed'] } } },
      { $group: { _id: '$eventType', n: { $sum: 1 } } },
    ]).toArray()
    for (const l of legacy) console.log(`  · ${l.n} eventos v1 "${l._id}" (se conservan; SaleConsumed se sigue proyectando)`)
    await dropIndexIfExists(ledger, 'eventId_1')
    await dropIndexIfExists(ledger, 'ledger_offline_sync')
  }

  // 3. Cachés derivadas ──────────────────────────────────────────────────────
  console.log('\n3. Estado y snapshots (cachés derivadas)')
  // Solo documentos con formato v1 (sin paramsVersion): re-ejecutar no toca el estado v2.
  for (const name of ['inventory_state', 'inventory_state_snapshots']) {
    if (!existing.has(name)) continue
    const v1 = { paramsVersion: { $exists: false } }
    const n = await coll(name).countDocuments(v1)
    console.log(`  · ${name}: ${n} documentos v1${APPLY && n ? ' → eliminados (se regeneran desde el ledger)' : n ? ' (se eliminarían)' : ''}`)
    if (APPLY && n) await coll(name).deleteMany(v1)
  }
  for (const [name, index] of [
    ['inventory_state', 'state_sigma_rank'],
    ['inventory_state', 'state_open_requests'],
    ['inventory_state', 'tenantId_1_skuId_1_storageLocationId_1'],
    ['inventory_state_snapshots', 'snapshot_reconstruct'],
  ] as const) {
    if (existing.has(name)) await dropIndexIfExists(coll(name), index)
  }

  // 4. Colecciones v1 sin uso ────────────────────────────────────────────────
  console.log('\n4. Colecciones v1 sin uso (no se borran)')
  for (const name of ['inventory_sku_menu_links', 'inventory_unit_equivalences']) {
    if (existing.has(name)) console.log(`  · ${name}: ${await coll(name).countDocuments()} documentos`)
  }

  // 5. Índices v2 ────────────────────────────────────────────────────────────
  console.log('\n5. Índices v2')
  const specs: Array<[string, Record<string, 1 | -1>, mongoose.mongo.CreateIndexesOptions]> = [
    ['inventory_ledger', { tenantId: 1, eventId: 1 }, { unique: true, name: 'ledger_event_id' }],
    ['inventory_ledger', { tenantId: 1, skuId: 1, storageLocationId: 1, occurredAt: 1, _id: 1 }, { name: 'ledger_aggregate_replay' }],
    ['inventory_ledger', { tenantId: 1, 'payload.consumption.skuId': 1, 'payload.consumption.storageLocationId': 1, occurredAt: 1 }, { name: 'ledger_sale_consumption', partialFilterExpression: { eventType: 'SaleRecorded' } }],
    ['inventory_ledger', { tenantId: 1, correlationId: 1, eventType: 1 }, { name: 'ledger_correlation' }],
    ['inventory_ledger', { tenantId: 1, locationId: 1, occurredAt: -1 }, { name: 'ledger_location_history' }],
    ['inventory_state', { tenantId: 1, skuId: 1, storageLocationId: 1 }, { unique: true, name: 'state_aggregate' }],
    ['inventory_state', { tenantId: 1, locationId: 1 }, { name: 'state_location' }],
    ['inventory_state_snapshots', { tenantId: 1, skuId: 1, storageLocationId: 1, dayIndex: -1 }, { unique: true, name: 'snapshot_day' }],
    ['inventory_storage_locations', { tenantId: 1, locationId: 1 }, { unique: true, partialFilterExpression: { isDefaultConsumption: true }, name: 'storage_default_consumption' }],
  ]
  if (duplicates.length === 0) specs.push(['inventory_skus', { tenantId: 1, nameKey: 1 }, { unique: true, name: 'sku_name' }])
  else console.log('  ! sku_name NO se crea hasta resolver los duplicados')
  for (const [name, keys, options] of specs) {
    console.log(`  · ${name}.${options.name}${APPLY ? '' : ' (se crearía)'}`)
    if (APPLY) {
      try {
        await coll(name).createIndex(keys, options)
      } catch (err) {
        console.log(`    ! no se pudo crear: ${(err as Error).message}`)
      }
    }
  }

  console.log(`\n${APPLY ? 'Listo.' : 'Simulación terminada: nada se modificó.'} Después del deploy: POST /api/{tenant}/inventory/rebuild por cada comercio con datos de inventario.`)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect()
  process.exit(1)
})
