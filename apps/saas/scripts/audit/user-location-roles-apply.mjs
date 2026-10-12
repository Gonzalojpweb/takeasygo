// ============================================================================
// user-location-roles-apply.mjs — Migración user_location_roles (Oleada 2)
// ============================================================================
// Escribe en la colección `user_location_roles` lo que calcula el dry-run:
//   - superadmin  => excluido (acceso total por diseño)
//   - consumer    => excluido (no es un rol de sede)
//   - usuario con assignedLocations  => una fila por cada sede asignada
//   - usuario sin assignedLocations  => una fila locationId:null (tenant-wide)
//   - role fuera del enum LocationRole => contado como inválido, NO migra
//
// Idempotente: bulkWrite upsert por (tenantId, userId, locationId). Re-correr
// no duplica filas. NO borra filas existentes (gestión manual posteriores).
//
// ALLOWLIST: solo corre contra `takeasygo-staging`. Cualquier otra base => exit 2.
// Sin --apply es dry-run (lee y reporta, no escribe).
//
// Uso:
//   $env:MONGODB_URI = "<uri staging>"
//   node scripts/audit/user-location-roles-apply.mjs --db takeasygo-staging          # dry-run
//   node scripts/audit/user-location-roles-apply.mjs --db takeasygo-staging --apply  # escribe
// ============================================================================

import mongoose from 'mongoose'
import { resolveDbName } from './_safety.mjs'

const ALLOWED_DB = 'takeasygo-staging'
// Debe coincidir con models/UserLocationRole.ts (LOCATION_ROLES)
const LOCATION_ROLES = ['admin', 'manager', 'staff', 'cashier', 'waiter', 'host', 'auditor', 'seller']
// Roles de User que no se migran a user_location_roles
const EXCLUDED_USER_ROLES = new Set(['superadmin', 'consumer'])

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

const argv = process.argv.slice(2)
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null
const apply = argv.includes('--apply')

const effectiveDb = resolveDbName(uri, dbName)
if (effectiveDb !== ALLOWED_DB) {
  console.error('')
  console.error('============================================================')
  console.error('  BLOQUEADO: esta migración solo corre contra takeasygo-staging')
  console.error('============================================================')
  console.error(`  Base efectiva: "${effectiveDb}"  (esperada: "${ALLOWED_DB}")`)
  console.error('  No hay override. Cambiá el target o corré otro script.')
  console.error('============================================================')
  process.exit(2)
}

function toOid(v) {
  return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null
}

async function main() {
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(ALLOWED_DB).db

  const users = await db
    .collection('users')
    .find({}, { projection: { tenantId: 1, role: 1, assignedLocations: 1, isActive: 1 } })
    .toArray()
  const tenants = await db.collection('tenants').find({}, { projection: { slug: 1 } }).toArray()
  const locations = await db
    .collection('locations')
    .find({}, { projection: { tenantId: 1 } })
    .toArray()

  const tenantIds = new Set(tenants.map(t => String(t._id)))
  const locTenant = new Map(locations.map(l => [String(l._id), String(l.tenantId)]))
  const tenantById = new Map(tenants.map(t => [String(t._id), t]))

  const ops = []
  const stats = {
    usersScanned: users.length,
    rowsPlanned: 0,
    rowsTenantWide: 0,
    rowsBySede: 0,
    skipped: { noTenant: 0, unknownTenant: 0, excludedRole: 0, invalidRole: 0, danglingLoc: 0, crossTenantLoc: 0 },
    invalidRoleDetail: [],
  }

  for (const u of users) {
    const role = u.role ?? null
    if (EXCLUDED_USER_ROLES.has(role)) {
      stats.skipped.excludedRole++
      continue
    }
    if (!u.tenantId || !tenantIds.has(String(u.tenantId))) {
      stats.skipped.noTenant++
      continue
    }
    const tenantIdOid = toOid(u.tenantId)
    const userIdOid = toOid(u._id)
    if (!tenantIdOid || !userIdOid) {
      stats.skipped.noTenant++
      continue
    }
    if (!LOCATION_ROLES.includes(role)) {
      stats.skipped.invalidRole++
      stats.invalidRoleDetail.push({
        tenant: tenantById.get(String(u.tenantId))?.slug ?? String(u.tenantId),
        role,
      })
      continue
    }

    const scope = (u.assignedLocations ?? []).map(String)
    if (scope.length === 0) {
      stats.rowsPlanned++
      stats.rowsTenantWide++
      ops.push({
        updateOne: {
          filter: { tenantId: tenantIdOid, userId: userIdOid, locationId: null },
          update: {
            $set: { tenantId: tenantIdOid, userId: userIdOid, locationId: null, role, isActive: u.isActive !== false },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      })
      continue
    }

    for (const locId of scope) {
      const owner = locTenant.get(locId)
      if (!owner) {
        stats.skipped.danglingLoc++
        continue
      }
      if (owner !== String(u.tenantId)) {
        stats.skipped.crossTenantLoc++
        continue
      }
      const locOid = toOid(locId)
      if (!locOid) {
        stats.skipped.danglingLoc++
        continue
      }
      stats.rowsPlanned++
      stats.rowsBySede++
      ops.push({
        updateOne: {
          filter: { tenantId: tenantIdOid, userId: userIdOid, locationId: locOid },
          update: {
            $set: { tenantId: tenantIdOid, userId: userIdOid, locationId: locOid, role, isActive: u.isActive !== false },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      })
    }
  }

  let applied = null
  if (apply && ops.length > 0) {
    const res = await db.collection('user_location_roles').bulkWrite(ops, { ordered: false })
    applied = {
      upserted: res.upsertedCount,
      modified: res.modifiedCount,
      matched: res.matchedCount,
    }
  }

  console.log(
    JSON.stringify(
      {
        script: 'user-location-roles-apply.mjs',
        mode: apply ? 'APPLY (escribió en staging)' : 'DRY-RUN (sin --apply, no escribe)',
        db: ALLOWED_DB,
        executedAt: new Date().toISOString(),
        stats,
        applied,
      },
      null,
      2
    )
  )

  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
