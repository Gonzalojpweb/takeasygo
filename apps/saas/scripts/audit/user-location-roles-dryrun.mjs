// ============================================================================
// user-location-roles-dryrun.mjs — Dry-run de migración user_location_roles
// ============================================================================
// READ-ONLY: solo find/aggregate/count. NO escribe nada en la base.
// Calcula, por tenant, las filas que crearía la colección
// user_location_roles {tenantId, userId, locationId|null, role}:
//   - usuario con assignedLocations  => una fila por cada sede asignada
//   - usuario sin assignedLocations  => una fila locationId:null (tenant completo)
//   - superadmin                     => excluido de la migración
//   - role fuera del enum            => contado como inválido (fila igual con su role crudo)
// Sin datos personales: no se proyecta email ni nombre de usuario.
//
// ALLOWLIST: solo corre contra `takeasygo-staging`. Cualquier otra base => exit 2.
//
// Uso:
//   $env:MONGODB_URI = "<uri staging>"; node scripts/audit/user-location-roles-dryrun.mjs --db takeasygo-staging
// ============================================================================

import mongoose from 'mongoose'
import { resolveDbName } from './_safety.mjs'

const ALLOWED_DB = 'takeasygo-staging'
// Matriz de roles de user_location_roles (decisión de Gonzalo: waiter incluido)
const ROLES = ['superadmin', 'admin', 'manager', 'staff', 'cashier', 'waiter', 'consumer', 'seller']

function tenantByIdSafe(tenants, id) {
  const t = tenants.find(x => String(x._id) === String(id))
  return t ? (t.slug ?? t.name ?? String(t._id)) : String(id)
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

const argv = process.argv.slice(2)
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

const effectiveDb = resolveDbName(uri, dbName)
if (effectiveDb !== ALLOWED_DB) {
  console.error('')
  console.error('============================================================')
  console.error('  BLOQUEADO: este dry-run solo corre contra takeasygo-staging')
  console.error('============================================================')
  console.error(`  Base efectiva: "${effectiveDb}"  (esperada: "${ALLOWED_DB}")`)
  console.error('  No hay override. Cambiá el target o corré otro script.')
  console.error('============================================================')
  process.exit(2)
}

async function main() {
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(ALLOWED_DB).db

  const tenants = await db
    .collection('tenants')
    .find({}, { projection: { slug: 1, name: 1, isActive: 1 } })
    .toArray()
  const locations = await db
    .collection('locations')
    .find({}, { projection: { tenantId: 1, name: 1, isActive: 1 } })
    .toArray()
  const users = await db
    .collection('users')
    .find({}, { projection: { tenantId: 1, role: 1, assignedLocations: 1, isActive: 1 } })
    .toArray()

  const existingUlrc = await db
    .collection('user_location_roles')
    .countDocuments({})
    .catch(() => null)

  const syncOrphans = await db
    .collection('sync_orders')
    .aggregate([
      { $match: { locationId: null } },
      { $group: { _id: '$tenantId', n: { $sum: 1 } } },
    ])
    .toArray()
  const memberOrphans = await db
    .collection('loyaltymembers')
    .aggregate([
      { $match: { locationId: null } },
      { $group: { _id: '$tenantId', n: { $sum: 1 } } },
    ])
    .toArray()

  const tenantById = new Map(tenants.map(t => [String(t._id), t]))
  const locationsByTenant = new Map()
  for (const l of locations) {
    const k = String(l.tenantId)
    if (!locationsByTenant.has(k)) locationsByTenant.set(k, [])
    locationsByTenant.get(k).push({ id: String(l._id), name: l.name, isActive: l.isActive ?? null })
  }
  const validLocIds = new Map(locations.map(l => [String(l._id), String(l.tenantId)]))

  const tenantIdSet = new Set(tenants.map(t => String(t._id)))
  const orphanLocations = locations.filter(
    l => !l.tenantId || !tenantIdSet.has(String(l.tenantId))
  )
  const usersWithScopeNoTenant = users.filter(
    u => (u.assignedLocations ?? []).length > 0 && (!u.tenantId || !tenantIdSet.has(String(u.tenantId)))
  )
  const superadminsWithScope = users.filter(
    u => u.role === 'superadmin' && (u.assignedLocations ?? []).length > 0
  )
  const invalidRoleDetail = []
  for (const u of users) {
    if (u.role && !ROLES.includes(u.role)) {
      invalidRoleDetail.push({
        tenant: u.tenantId ? tenantByIdSafe(tenants, u.tenantId) : null,
        role: u.role,
      })
    }
  }

  const totals = {
    usersScanned: users.length,
    superadminsExcluded: 0,
    usersWithoutTenant: 0,
    usersWithScope: 0,
    usersTenantWide: 0,
    invalidRoleUsers: 0,
    plannedRows: 0,
    danglingLocationRefs: 0,
    crossTenantLocationRefs: 0,
  }
  const perTenant = []

  for (const t of tenants) {
    const tid = String(t._id)
    const locs = locationsByTenant.get(tid) ?? []
    const stats = {
      tenantId: tid,
      slug: t.slug ?? null,
      name: t.name ?? null,
      isActive: t.isActive ?? null,
      locations: locs,
      users: {
        total: 0,
        active: 0,
        superadminExcluded: 0,
        withScope: 0,
        tenantWide: 0,
        invalidRole: 0,
        byRole: {},
      },
      plannedRows: 0,
      plannedRowsByLocation: {},
      danglingLocationRefs: 0,
      crossTenantLocationRefs: 0,
    }
    perTenant.push(stats)
    for (const loc of locs) stats.plannedRowsByLocation[loc.id] = 0
    stats.plannedRowsByLocation['null'] = 0
  }

  for (const u of users) {
    const role = u.role ?? null
    const validRole = ROLES.includes(role)

    if (role === 'superadmin') {
      totals.superadminsExcluded++
      const tid = u.tenantId ? String(u.tenantId) : null
      const st = tid ? perTenant.find(p => p.tenantId === tid) : null
      if (st) st.users.superadminExcluded++
      continue
    }

    if (!u.tenantId) {
      totals.usersWithoutTenant++
      continue
    }

    const tid = String(u.tenantId)
    const st = perTenant.find(p => p.tenantId === tid)
    if (!st) {
      totals.usersWithoutTenant++
      continue
    }

    st.users.total++
    if (u.isActive !== false) st.users.active++
    st.users.byRole[role ?? '(sin role)'] = (st.users.byRole[role ?? '(sin role)'] ?? 0) + 1
    if (!validRole) {
      st.users.invalidRole++
      totals.invalidRoleUsers++
    }

    const scope = u.assignedLocations ?? []
    if (scope.length === 0) {
      st.users.tenantWide++
      st.plannedRows++
      st.plannedRowsByLocation['null']++
      totals.usersTenantWide++
      totals.plannedRows++
    } else {
      st.users.withScope++
      totals.usersWithScope++
      for (const locId of scope.map(String)) {
        const ownerTenant = validLocIds.get(locId)
        if (!ownerTenant) {
          st.danglingLocationRefs++
          totals.danglingLocationRefs++
          continue
        }
        if (ownerTenant !== tid) {
          st.crossTenantLocationRefs++
          totals.crossTenantLocationRefs++
          continue
        }
        st.plannedRows++
        st.plannedRowsByLocation[locId] = (st.plannedRowsByLocation[locId] ?? 0) + 1
        totals.plannedRows++
      }
    }
  }

  const orphans = {
    syncOrdersNoLocation: syncOrphans
      .map(o => ({ tenant: tenantById.get(String(o._id))?.slug ?? String(o._id), n: o.n }))
      .sort((a, b) => b.n - a.n),
    loyaltyMembersNoLocation: memberOrphans
      .map(o => ({ tenant: tenantById.get(String(o._id))?.slug ?? String(o._id), n: o.n }))
      .sort((a, b) => b.n - a.n),
  }

  const out = {
    script: 'user-location-roles-dryrun.mjs',
    mode: 'DRY-RUN (read-only, sin escrituras)',
    db: ALLOWED_DB,
    executedAt: new Date().toISOString(),
    existingUserLocationRolesDocs: existingUlrc,
    totals: {
      tenants: tenants.length,
      multisedeTenants: perTenant.filter(p => p.locations.length > 1).length,
      locations: locations.length,
      ...totals,
    },
    multisedeTenantsList: perTenant
      .filter(p => p.locations.length > 1)
      .map(p => ({ slug: p.slug, locations: p.locations, users: p.users.total })),
    consistency: {
      locationsTotal: locations.length,
      locationsAssignedToKnownTenant:
        locations.length - orphanLocations.length,
      orphanLocations: orphanLocations.map(l => ({
        id: String(l._id),
        name: l.name,
        tenantId: l.tenantId ? String(l.tenantId) : null,
        tenantKnown: l.tenantId ? tenantIdSet.has(String(l.tenantId)) : false,
      })),
      usersWithScopeOutsideKnownTenants: usersWithScopeNoTenant.length,
      usersWithScopeOutsideKnownTenantsDetail: {
        noTenantId: usersWithScopeNoTenant.filter(u => !u.tenantId).length,
        unknownTenantId: usersWithScopeNoTenant.filter(
          u => u.tenantId && !tenantIdSet.has(String(u.tenantId))
        ).length,
      },
      superadminsWithScope: superadminsWithScope.length,
      invalidRoleDetail,
    },
    perTenant: perTenant.map(p => ({
      tenantId: p.tenantId,
      slug: p.slug,
      name: p.name,
      locations: p.locations,
      users: p.users,
      plannedRows: p.plannedRows,
      plannedRowsByLocation: p.plannedRowsByLocation,
      danglingLocationRefs: p.danglingLocationRefs,
      crossTenantLocationRefs: p.crossTenantLocationRefs,
    })),
    orphansBackfill: orphans,
  }

  console.log(JSON.stringify(out, null, 2))

  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
