// ============================================================================
// tenant-topology.mjs — Topología multisede por tenant (READ-ONLY)
// ============================================================================
// Para cerrar la validación del Paso A:
//   - tenants y cuántas sedes tiene cada uno
//   - dónde están los legacy sin sede (loyaltymembers, sync_orders)
//   - users con assignedLocations (cuántos tienen alcance por sede)
// Uso (solo lectura):
//   $env:MONGODB_URI = "<uri>"; node scripts/audit/tenant-topology.mjs --db <nombre>
//
// PRODUCCIÓN es la base default `test`. El script corta (exit 2) si el target
// resuelve a `test`, salvo override explícito `--allow-prod` (o AUDIT_ALLOW_PROD=1).
// ============================================================================

import mongoose from 'mongoose'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

const argv = process.argv.slice(2)
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

// Protección anti-producción: corta si el target es la base `test`.
guardAgainstProd(uri, dbName, argv)

async function main() {
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
  const db = dbName ? mongoose.connection.useDb(dbName).db : mongoose.connection.db

  const tenants = await db.collection('tenants').find({}).toArray()

  const locationsByTenant = await db
    .collection('locations')
    .aggregate([{ $group: { _id: '$tenantId', n: { $sum: 1 } } }])
    .toArray()
  const locMap = new Map(locationsByTenant.map(l => [String(l._id), l.n]))

  const membersNoSedeByTenant = await db
    .collection('loyaltymembers')
    .aggregate([
      { $match: { locationId: null } },
      { $group: { _id: '$tenantId', n: { $sum: 1 } } },
    ])
    .toArray()
  const memberMap = new Map(membersNoSedeByTenant.map(m => [String(m._id), m.n]))

  const syncOrdersNoSedeByTenant = await db
    .collection('sync_orders')
    .aggregate([
      { $match: { locationId: null } },
      { $group: { _id: '$tenantId', n: { $sum: 1 } } },
    ])
    .toArray()
  const syncMap = new Map(syncOrdersNoSedeByTenant.map(s => [String(s._id), s.n]))

  const usersWithLocations = await db
    .collection('users')
    .countDocuments({ assignedLocations: { $exists: true, $not: { $size: 0 } } })
  const usersTotal = await db.collection('users').countDocuments({})

  const rows = tenants.map(t => ({
    tenant: String(t._id),
    slug: t.slug ?? t.name ?? '(sin slug)',
    active: t.isActive ?? null,
    loyaltyPerLocation: t.loyalty?.perLocation ?? null,
    locations: locMap.get(String(t._id)) ?? 0,
    membersSinSede: memberMap.get(String(t._id)) ?? 0,
    syncOrdersSinSede: syncMap.get(String(t._id)) ?? 0,
  }))
  rows.sort((a, b) => b.locations - a.locations)

  const out = {
    db: dbName ?? '(default)',
    tenants: rows.length,
    users: usersTotal,
    usersConSede: usersWithLocations,
    tenants: rows,
  }
  console.log(JSON.stringify(out, null, 2))

  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})