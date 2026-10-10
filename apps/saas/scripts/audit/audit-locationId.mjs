// ============================================================================
// audit-locationId.mjs — Medición READ-ONLY de cobertura de sede (locationId)
// ============================================================================
// Auditoría multisede · Fase 1 / Paso A.
//
// QUÉ HACE (nunca escribe):
//   1. Lista todas las colecciones con su conteo.
//   2. Para cada colección de la lista objetivo reporta:
//        - total de documentos
//        - documentos SIN locationId (nulos o ausentes)
//        - sedes distintas y su conteo
//        - locationId huérfanos (no existen en `locations`)
//        - documentos con _needsLocationReview: true
//   3. Descubre los nombres reales de colección de los modelos clave
//      (para no depender de la pluralización de Mongoose).
//
// CÓMO USAR (contra una copia anonimizada de Chopis Burger, NUNCA prod):
//   $env:MONGODB_URI = "<uri-copia-anonimizada>"
//   node apps/saas/scripts/audit/audit-locationId.mjs            # reporte
//   node apps/saas/scripts/audit/audit-locationId.mjs --list     # solo nombres
//   node apps/saas/scripts/audit/audit-locationId.mjs --json     # salida JSON
//
// PRODUCCIÓN es la base default `test`. El script corta (exit 2) si el target
// resuelve a `test`, salvo override explícito `--allow-prod` (o AUDIT_ALLOW_PROD=1).
//
// Este script SOLO lee. No crea índices ni modifica documentos.
// ============================================================================

import mongoose from 'mongoose'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI. Apuntá a la copia anonimizada (NUNCA producción).')
  process.exit(1)
}

const argv = process.argv.slice(2)
const args = new Set(argv)
const LIST_ONLY = args.has('--list')
const AS_JSON = args.has('--json')
const LIST_DBS = args.has('--dbs')
const dbArgIdx = argv.indexOf('--db')
const DB_NAME = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

// Protección anti-producción: corta si el target es la base `test`.
guardAgainstProd(uri, DB_NAME, argv)

// Colecciones objetivo (nombres REALES verificados en los modelos).
//   tenant   = campo de inquilino
//   location = true si el modelo DEBERÍA tener sede
//   locField = nombre del campo de sede (por defecto locationId)
// SaaS models usan pluralización por defecto; los del sync layer (packages/db)
// usan nombre explícito snake_case.
const TARGETS = [
  { name: 'orders', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'reservations', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'printers', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'cashregisters', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'cashmovements', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'precloseprintjobs', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'menus', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'loyaltymembers', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'inventory_storage_locations', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'sync_orders', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'z_report_records', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'cash_sale_events', tenant: 'tenantId', location: true, locField: 'locationId' },
  { name: 'auditlogs', tenant: 'tenantId', location: false, locField: 'locationId' },
  { name: 'sync_audit_logs', tenant: 'tenantId', location: false, locField: 'locationId' },
  { name: 'inventory_skus', tenant: 'tenantId', location: false, locField: 'locationId' },
  { name: 'inventory_recipes', tenant: 'tenantId', location: false, locField: 'locationId' },
]

const CONFIG_COLLECTIONS = ['platformconfigs']

function isMissing(v) {
  return v === null || v === undefined
}

async function main() {
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
  let db = mongoose.connection.db

  if (LIST_DBS) {
    const { databases } = await db.admin().listDatabases()
    console.log(JSON.stringify(databases.map(d => ({ name: d.name, sizeOnDisk: d.sizeOnDisk })), null, 2))
    await mongoose.disconnect()
    return
  }

  if (DB_NAME) db = mongoose.connection.useDb(DB_NAME).db

  const all = await db.listCollections().toArray()
  const names = all.map(c => c.name).sort()

  if (LIST_ONLY) {
    console.log(JSON.stringify(names, null, 2))
    await mongoose.disconnect()
    return
  }

  const present = new Set(names)
  // Ids de sedes válidas (para detectar huérfanos).
  let validLocationIds = new Set()
  if (present.has('locations')) {
    const locs = await db.collection('locations').find({}, { projection: { _id: 1 } }).toArray()
    validLocationIds = new Set(locs.map(l => String(l._id)))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    collections: names,
    targets: [],
    config: [],
    missingFromDb: [],
  }

  for (const t of TARGETS) {
    if (!present.has(t.name)) {
      report.missingFromDb.push(t.name)
      continue
    }
    const col = db.collection(t.name)
    const locField = t.locField || 'locationId'
    const total = await col.countDocuments({})
    const missingLocation = t.location
      ? await col.countDocuments({ [locField]: null })
      : null
    const needsReview = await col.countDocuments({ _needsLocationReview: true })

    const byLocation = t.location
      ? await col
          .aggregate([
            { $group: { _id: `$${locField}`, n: { $sum: 1 } } },
            { $sort: { n: -1 } },
          ])
          .toArray()
      : []

    let orphans = 0
    if (t.location && validLocationIds.size) {
      for (const g of byLocation) {
        if (!isMissing(g._id) && !validLocationIds.has(String(g._id))) orphans += g.n
      }
    }

    report.targets.push({
      collection: t.name,
      expectsLocation: t.location,
      total,
      missingLocation,
      needsLocationReview: needsReview,
      distinctLocations: byLocation.length,
      orphanLocationDocs: orphans,
      byLocation: byLocation.map(g => ({
        locationId: g._id == null ? '(sin sede)' : String(g._id),
        count: g.n,
      })),
    })
  }

  for (const name of CONFIG_COLLECTIONS) {
    if (!present.has(name)) continue
    const col = db.collection(name)
    report.config.push({ collection: name, total: await col.countDocuments({}) })
  }

  await mongoose.disconnect()

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2))
    return
  }

  console.log('=== AUDITORÍA locationId (read-only) ===')
  console.log(`Fecha: ${report.generatedAt}`)
  console.log(`Colecciones en la DB: ${names.length}`)
  console.log('')
  console.log('colección'.padEnd(30), 'total'.padStart(8), 'sinSede'.padStart(9), 'revisar'.padStart(8), 'sedes'.padStart(6), 'huérf'.padStart(6))
  for (const t of report.targets) {
    console.log(
      t.collection.padEnd(30),
      String(t.total).padStart(8),
      String(t.missingLocation ?? '-').padStart(9),
      String(t.needsLocationReview).padStart(8),
      String(t.distinctLocations).padStart(6),
      String(t.orphanLocationDocs).padStart(6)
    )
  }
  if (report.missingFromDb.length) {
    console.log('')
    console.log('⚠ No encontradas en la DB (verificar nombres):', report.missingFromDb.join(', '))
  }
  console.log('')
  console.log('Detalle por sede:')
  for (const t of report.targets) {
    if (!t.expectsLocation || !t.byLocation.length) continue
    console.log(`  ${t.collection}:`)
    for (const g of t.byLocation) console.log(`    ${g.locationId} → ${g.count}`)
  }
}

main().catch(err => {
  console.error('Error en la auditoría:', err.message)
  process.exit(1)
})
