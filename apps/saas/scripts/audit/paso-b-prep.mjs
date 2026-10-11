// ============================================================================
// paso-b-prep.mjs — Preparación Paso B (STAGING ONLY, dry-run + apply)
// ============================================================================
// Modos (argv[2]):
//   scan          → SOLO LECTURA: todos los chequeos y dry-runs, imprime JSON
//   scan-prod     → SOLO LECTURA: verifica locations/tenants huérfanos en prod
//                   (requiere --allow-prod, usa guardAgainstProd)
//   apply-locations      → respaldo + borra las 9 locations huérfanas (staging)
//   apply-sync-tenant    → respaldo + borra los sync_orders del tenant inexistente
//   apply-backfill       → completa locationId (sede única) en sync_orders y
//                           loyaltymembers de tenants single-sede
//   create-test-users    → crea usuarios de prueba por rol/sede en palmyra y
//                           lacasetta-focaccia
//
// ALLOWLIST: los modos apply y scan solo corren contra takeasygo-staging.
// scan-prod solo contra la base `test` (producción) y es read-only.
// ============================================================================

import mongoose from 'mongoose'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'
import * as bcrypt from 'bcryptjs'

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
  `${process.env.TEMP}\\opencode\\staging-backup-${new Date().toISOString().slice(0, 10)}`

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function allCollectionNames(db) {
  const cols = await db.listCollections().toArray()
  return cols.map(c => c.name).filter(n => !n.startsWith('system.'))
}

async function countByCollection(db, field, ids) {
  const objIds = []
  const strIds = []
  for (const id of ids) {
    try {
      objIds.push(new mongoose.Types.ObjectId(String(id)))
    } catch {
      /* no es ObjectId */
    }
    strIds.push(String(id))
  }
  const out = {}
  for (const name of await allCollectionNames(db)) {
    const n = await db
      .collection(name)
      .countDocuments({
        $or: [{ [field]: { $in: objIds } }, { [field]: { $in: strIds } }],
      })
      .catch(() => 0)
    if (n > 0) out[name] = n
  }
  return out
}

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
// SCAN (staging, read-only)
// ---------------------------------------------------------------------------
async function scan() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const tenants = await db.collection('tenants').find({}, { projection: { slug: 1, name: 1 } }).toArray()
  const tenantIdSet = new Set(tenants.map(t => String(t._id)))
  const locations = await db.collection('locations').find({}).toArray()

  // 1) locations huérfanas (tenantId null o tenant desconocido)
  const orphanLocs = locations.filter(l => !l.tenantId || !tenantIdSet.has(String(l.tenantId)))
  const orphanLocIds = orphanLocs.map(l => String(l._id))
  const orphanLocDependents = {}
  for (const id of orphanLocIds) {
    const byCol = {}
    for (const field of ['locationId', 'location']) {
      const counts = await countByCollection(db, field, [id])
      for (const [col, n] of Object.entries(counts)) {
        if (col === 'locations') continue
        byCol[col] = (byCol[col] ?? 0) + n
      }
    }
    orphanLocDependents[id] = byCol
  }
  const orphanLocsOut = orphanLocs.map(l => ({
    id: String(l._id),
    name: l.name,
    slug: l.slug ?? null,
    tenantId: l.tenantId ? String(l.tenantId) : null,
    isActive: l.isActive ?? null,
    dependents: orphanLocDependents[String(l._id)],
    dependentsTotal: Object.values(orphanLocDependents[String(l._id)]).reduce((a, b) => a + b, 0),
  }))

  // 1b) referencias fuera de locationId: assignedLocations (users),
  //     discoveredBusinessesList (loyaltymembers) y dependientes de los menús
  const orphanObjIds = orphanLocs.map(l => l._id)
  const usersRefOrphans = await db.collection('users').countDocuments({ assignedLocations: { $in: orphanObjIds } })
  const loyaltyRefOrphans = await db
    .collection('loyaltymembers')
    .countDocuments({ discoveredBusinessesList: { $in: orphanObjIds } })
  const orphanMenuIds = (await db.collection('menus').find({ locationId: { $in: orphanObjIds } }, { projection: { _id: 1 } }).toArray()).map(m => m._id)
  const menuDeps = {}
  for (const col of ['menuvisits', 'menuinsights', 'itemlikes', 'orders']) {
    const n = await db.collection(col).countDocuments({ menuId: { $in: orphanMenuIds } }).catch(() => 0)
    if (n > 0) menuDeps[col] = n
  }

  // 2) tenant inexistente con sync_orders huérfanos
  const ghostTenantId = '6a5583a37de41364ef75d662'
  const ghostExists = tenantIdSet.has(ghostTenantId)
  const ghostCounts = await countByCollection(db, 'tenantId', [ghostTenantId])
  const ghostSyncOrders = await db
    .collection('sync_orders')
    .find({ tenantId: ghostTenantId })
    .toArray()
    .catch(() => [])

  // 3) usuarios con sede pero sin tenant
  const threeUsers = await db
    .collection('users')
    .find(
      { assignedLocations: { $exists: true, $not: { $size: 0 } }, tenantId: null },
      { projection: { role: 1, assignedLocations: 1, isActive: 1, createdAt: 1, lastLoginAt: 1, email: 1, googleContacts: 1 } }
    )
    .toArray()
  const locById = new Map(locations.map(l => [String(l._id), l.name]))
  const threeUsersOut = threeUsers.map(u => ({
    id: String(u._id),
    email: u.email,
    role: u.role,
    assignedLocations: (u.assignedLocations ?? []).map(id => ({ id: String(id), name: locById.get(String(id)) ?? '(desconocida)' })),
    isActive: u.isActive,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt ?? null,
    googleContactsConnected: u.googleContacts?.isConnected ?? false,
  }))

  // 4) usuarios sin tenant — ¿son consumidores?
  const noTenantAgg = await db
    .collection('users')
    .aggregate([
      { $match: { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] } },
      { $group: { _id: '$role', n: { $sum: 1 }, active: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } } } },
      { $sort: { n: -1 } },
    ])
    .toArray()
  const noTenantTotal = await db
    .collection('users')
    .countDocuments({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] })
  const noTenantWithPassword = await db
    .collection('users')
    .countDocuments({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }], password: { $exists: true, $ne: null } })

  // 4b) usuarios con tenantId que apunta a un tenant inexistente
  const withTenant = await db
    .collection('users')
    .find({ tenantId: { $ne: null } }, { projection: { email: 1, role: 1, tenantId: 1, assignedLocations: 1, isActive: 1, lastLoginAt: 1 } })
    .toArray()
  const unknownTenantUsers = withTenant
    .filter(u => !tenantIdSet.has(String(u.tenantId)))
    .map(u => ({
      id: String(u._id),
      email: u.email,
      role: u.role,
      tenantId: String(u.tenantId),
      assignedLocations: (u.assignedLocations ?? []).map(String),
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ?? null,
    }))

  // 5) backfill dry-run: tenants single-sede con docs sin locationId
  const singleSede = new Map()
  const locsByTenant = new Map()
  for (const l of locations) {
    const k = String(l.tenantId)
    if (!locsByTenant.has(k)) locsByTenant.set(k, [])
    locsByTenant.get(k).push(l)
  }
  for (const [tid, locs] of locsByTenant) {
    if (locs.length === 1 && tenantIdSet.has(tid)) singleSede.set(tid, locs[0])
  }

  const syncOrphans = await db
    .collection('sync_orders')
    .aggregate([{ $match: { locationId: null } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }])
    .toArray()
  const memberOrphans = await db
    .collection('loyaltymembers')
    .aggregate([{ $match: { locationId: null } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }])
    .toArray()

  const slugOf = tid => tenants.find(t => String(t._id) === String(tid))?.slug ?? null
  const planSync = []
  const planMembers = []
  const excluded = { chopisburgerSyncOrders: [], ghostTenantSyncOrders: [], multisedeTenants: [] }
  for (const row of syncOrphans) {
    const tid = String(row._id)
    if (tid === ghostTenantId) {
      excluded.ghostTenantSyncOrders.push({ n: row.n })
      continue
    }
    if (slugOf(tid) === 'chopisburger') {
      excluded.chopisburgerSyncOrders.push({ n: row.n })
      continue
    }
    const sede = singleSede.get(tid)
    planSync.push({
      tenant: slugOf(tid) ?? tid,
      tenantId: tid,
      docs: row.n,
      targetSede: sede ? { id: String(sede._id), name: sede.name } : null,
      singleSede: !!sede,
    })
  }
  for (const row of memberOrphans) {
    const tid = String(row._id)
    const sede = singleSede.get(tid)
    planMembers.push({
      tenant: slugOf(tid) ?? tid,
      tenantId: tid,
      docs: row.n,
      targetSede: sede ? { id: String(sede._id), name: sede.name } : null,
      singleSede: !!sede,
    })
  }

  // 6) plan de usuarios de prueba
  const TEST_ROLES = ['admin', 'manager', 'staff', 'cashier', 'seller', 'waiter']
  const testTenants = ['palmyra', 'lacasetta-focaccia']
  const testUsersPlan = []
  for (const slug of testTenants) {
    const t = tenants.find(x => x.slug === slug)
    const locs = (locsByTenant.get(String(t?._id)) ?? []).slice().sort((a, b) => String(a._id).localeCompare(String(b._id)))
    locs.forEach((loc, idx) => {
      for (const role of TEST_ROLES) {
        const email = `${slug}-${role}-s${idx + 1}@e2e.test`
        testUsersPlan.push({
          email,
          name: `Test ${slug} ${role} S${idx + 1}`,
          role,
          tenantId: String(t._id),
          assignedLocations: [String(loc._id)],
          sede: loc.name,
        })
      }
    })
  }
  const existingEmails = await db
    .collection('users')
    .find(
      { email: { $in: testUsersPlan.map(u => u.email) } },
      { projection: { email: 1 } }
    )
    .toArray()
  const existingSet = new Set(existingEmails.map(e => e.email))

  const out = {
    mode: 'scan',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    backupRoot: BACKUP_ROOT,
    orphanLocations: {
      count: orphanLocsOut.length,
      docs: orphanLocsOut,
      dependentsTotal: orphanLocsOut.reduce((a, l) => a + l.dependentsTotal, 0),
      allWithoutDependents: orphanLocsOut.every(l => l.dependentsTotal === 0),
      extraRefs: {
        usersAssignedToOrphanLocations: usersRefOrphans,
        loyaltyDiscoveredList: loyaltyRefOrphans,
        orphanMenus: orphanMenuIds.length,
        menuDependents: menuDeps,
      },
    },
    ghostTenant: {
      tenantId: ghostTenantId,
      existsInTenants: ghostExists,
      docCountsByCollection: ghostCounts,
      syncOrdersDocs: ghostSyncOrders.length,
    },
    threeUsersWithScopeNoTenant: threeUsersOut,
    usersWithoutTenant: {
      total: noTenantTotal,
      byRole: noTenantAgg.map(r => ({ role: r._id, n: r.n, active: r.active })),
      withPassword: noTenantWithPassword,
    },
    usersWithUnknownTenant: {
      count: unknownTenantUsers.length,
      users: unknownTenantUsers,
    },
    backfillDryRun: {
      syncOrders: planSync,
      syncOrdersDocsTotal: planSync.reduce((a, r) => a + r.docs, 0),
      loyaltyMembers: planMembers,
      loyaltyMembersDocsTotal: planMembers.reduce((a, r) => a + r.docs, 0),
      excluded,
    },
    testUsersPlan: {
      total: testUsersPlan.length,
      alreadyExisting: testUsersPlan.filter(u => existingSet.has(u.email)).length,
      users: testUsersPlan.map(u => ({ ...u, exists: existingSet.has(u.email) })),
    },
  }
  console.log(JSON.stringify(out, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// SCAN-PROD (read-only, base test)
// ---------------------------------------------------------------------------
async function scanProd() {
  guardAgainstProd(uri, dbName, [...argv, ...(dbName === 'test' ? [] : [])])
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db

  const orphanLocIds = [
    '69b82093c1619e51d3034f0c', '69b820a8c1619e51d3034f19', '69b8ada52ca4e01c6faa4994',
    '69bf0d832fba13b59b208089', '69c025ce399b34dcf5d44e3b', '69c0df2971ee0ca5b9234e07',
    '69d6944e8b717e4cff5c1cc6', '69d69ed2fb879dea57d716d5', '69ef684dbf487d317a1e6f81',
  ]
  const orphanTenantIds = [
    '69b82046c1619e51d3034f03', '69b8ad582ca4e01c6faa498a', '69bf0cdc60c4969984c9024e',
    '69c024f19b9a286ae181c05d', '69c0ded971ee0ca5b9234dfb', '69d693948b717e4cff5c1cb9',
    '69d69e4dfb879dea57d716ce', '69ef67bfbf487d317a1e6f73', '6a5583a37de41364ef75d662',
  ]

  const locIds = orphanLocIds.map(id => new mongoose.Types.ObjectId(id))
  const locsInProd = await db.collection('locations').find({ _id: { $in: locIds } }).toArray()
  const tenantIds = orphanTenantIds.map(id => new mongoose.Types.ObjectId(id))
  const tenantsInProd = await db.collection('tenants').find({ _id: { $in: tenantIds } }).toArray()

  // ¿los 3 usuarios "manager sin tenant" y sus locations existen en prod?
  const suspectEmails = ['romario@gmail.com', 'nico@gmail.com', 'bravo@gmail.com']
  const suspectUsersInProd = await db
    .collection('users')
    .find({ email: { $in: suspectEmails } }, { projection: { email: 1, role: 1, tenantId: 1, assignedLocations: 1, createdAt: 1 } })
    .toArray()
  const suspectLocIds = ['69f904e4b3a77ab93db18cdb', '69f90534b3a77ab93db18cf8', '699a2e4a48c8b8f61bc6e254', '6a5584450d66b6dec36e9085']
    .map(id => new mongoose.Types.ObjectId(id))
  const suspectLocsInProd = await db.collection('locations').find({ _id: { $in: suspectLocIds } }).toArray()

  const out = {
    mode: 'scan-prod',
    db: '(default)',
    executedAt: new Date().toISOString(),
    readOnly: true,
    locationsChecked: orphanLocIds.length,
    locationsFoundInProd: locsInProd.map(l => ({ id: String(l._id), name: l.name, tenantId: String(l.tenantId) })),
    tenantsChecked: orphanTenantIds.length,
    tenantsFoundInProd: tenantsInProd.map(t => ({ id: String(t._id), slug: t.slug })),
    suspectUsersInProd: suspectUsersInProd.map(u => ({
      email: u.email, role: u.role, tenantId: u.tenantId ? String(u.tenantId) : null,
      assignedLocations: (u.assignedLocations ?? []).map(String), createdAt: u.createdAt,
    })),
    suspectLocationsInProd: suspectLocsInProd.map(l => ({ id: String(l._id), name: l.name, tenantId: String(l.tenantId) })),
  }
  console.log(JSON.stringify(out, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: locations huérfanas + sus menús y menuinsights (decisión: Gonzalo)
// ---------------------------------------------------------------------------
async function applyLocations() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const before = {
    locations: await db.collection('locations').countDocuments({}),
    menus: await db.collection('menus').countDocuments({}),
    menuinsights: await db.collection('menuinsights').countDocuments({}),
  }

  const tenants = await db.collection('tenants').find({}, { projection: { slug: 1 } }).toArray()
  const tenantIdSet = new Set(tenants.map(t => String(t._id)))
  const locations = await db.collection('locations').find({}).toArray()
  const orphanLocs = locations.filter(l => !l.tenantId || !tenantIdSet.has(String(l.tenantId)))
  if (orphanLocs.length === 0) {
    console.log(JSON.stringify({ mode: 'apply-locations', result: 'nada que hacer (0 huérfanas)', before }))
    await mongoose.disconnect()
    return
  }

  const ids = orphanLocs.map(l => l._id)
  // referencias que NO deben existir (aborta si aparecen)
  const usersRef = await db.collection('users').countDocuments({ assignedLocations: { $in: ids } })
  const loyaltyRef = await db.collection('loyaltymembers').countDocuments({ discoveredBusinessesList: { $in: ids } })
  const syncRef = await db.collection('sync_orders').countDocuments({ locationId: { $in: ids.map(String) } })
  if (usersRef > 0 || loyaltyRef > 0 || syncRef > 0) {
    console.error('ABORTADO: referencias externas detectadas:', JSON.stringify({ usersRef, loyaltyRef, syncRef }))
    process.exit(3)
  }

  const orphanMenus = await db.collection('menus').find({ locationId: { $in: ids } }).toArray()
  const orphanMenuIds = orphanMenus.map(m => m._id)
  const orphanInsights = await db.collection('menuinsights').find({ locationId: { $in: ids } }).toArray()
  // dependientes de esos menús (no locationId)
  const menuDeps = {}
  for (const col of ['menuvisits', 'itemlikes', 'orders']) {
    const n = await db.collection(col).countDocuments({ menuId: { $in: orphanMenuIds } }).catch(() => 0)
    if (n > 0) menuDeps[col] = n
  }
  if (Object.keys(menuDeps).length > 0) {
    console.error('ABORTADO: los menús huérfanos tienen dependientes:', JSON.stringify(menuDeps))
    process.exit(3)
  }

  const backup = {
    script: 'paso-b-prep.mjs apply-locations',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'backup antes de borrar 9 locations huérfanas + 9 menús + 5 menuinsights',
    before,
    counts: { locations: orphanLocs.length, menus: orphanMenus.length, menuinsights: orphanInsights.length },
    locations: orphanLocs,
    menus: orphanMenus,
    menuinsights: orphanInsights,
  }
  const p = writeBackup('locations-orphanas.json', backup)

  const dInsights = await db.collection('menuinsights').deleteMany({ _id: { $in: orphanInsights.map(m => m._id) } })
  const dMenus = await db.collection('menus').deleteMany({ _id: { $in: orphanMenuIds } })
  const dLocs = await db.collection('locations').deleteMany({ _id: { $in: ids } })

  const after = {
    locations: await db.collection('locations').countDocuments({}),
    menus: await db.collection('menus').countDocuments({}),
    menuinsights: await db.collection('menuinsights').countDocuments({}),
    orphanLocationsRemaining: await db.collection('locations').countDocuments({ _id: { $in: ids } }),
    orphanMenusRemaining: await db.collection('menus').countDocuments({ locationId: { $in: ids } }),
    orphanInsightsRemaining: await db.collection('menuinsights').countDocuments({ locationId: { $in: ids } }),
  }
  console.log(JSON.stringify({
    mode: 'apply-locations',
    backup: p,
    deleted: { locations: dLocs.deletedCount, menus: dMenus.deletedCount, menuinsights: dInsights.deletedCount },
    before,
    after,
  }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: sync_orders del tenant fantasma
// ---------------------------------------------------------------------------
async function applyGhostSync() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db
  const ghost = '6a5583a37de41364ef75d662'

  const beforeTotal = await db.collection('sync_orders').countDocuments({})
  const docs = await db.collection('sync_orders').find({ tenantId: ghost }).toArray()
  if (docs.length === 0) {
    console.log(JSON.stringify({ mode: 'apply-sync-tenant', result: 'nada que borrar', before: { total: beforeTotal, ghost: 0 } }))
    await mongoose.disconnect()
    return
  }
  const backup = {
    script: 'paso-b-prep.mjs apply-sync-tenant',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'backup antes de borrar sync_orders del tenant inexistente',
    tenantId: ghost,
    docs,
    restore: 'insertMany(docs) — los docs se conservan completos en este archivo',
  }
  const p = writeBackup('sync-orders-tenant-inexistente.json', backup)

  const del = await db.collection('sync_orders').deleteMany({ tenantId: ghost })
  const after = {
    total: await db.collection('sync_orders').countDocuments({}),
    ghost: await db.collection('sync_orders').countDocuments({ tenantId: ghost }),
  }
  console.log(JSON.stringify({
    mode: 'apply-sync-tenant',
    backup: p,
    before: { total: beforeTotal, ghost: docs.length },
    deleted: del.deletedCount,
    after,
  }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// APPLY: backfill sede única
// ---------------------------------------------------------------------------
async function applyBackfill() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const tenants = await db.collection('tenants').find({}, { projection: { slug: 1 } }).toArray()
  const tenantIdSet = new Set(tenants.map(t => String(t._id)))
  const locations = await db.collection('locations').find({}).toArray()
  const locsByTenant = new Map()
  for (const l of locations) {
    const k = String(l.tenantId)
    if (!locsByTenant.has(k)) locsByTenant.set(k, [])
    locsByTenant.get(k).push(l)
  }
  const slugOf = tid => tenants.find(t => String(t._id) === tid)?.slug ?? null

  const before = {
    syncOrdersNoLocation: await db.collection('sync_orders').countDocuments({ locationId: null }),
    loyaltyMembersNoLocation: await db.collection('loyaltymembers').countDocuments({ locationId: null }),
  }

  const results = { syncOrders: [], loyaltyMembers: [], skipped: [] }

  // FASE 1: recolectar docs a modificar (SIN escribir)
  const plan = []
  const backupDocs = { sync_orders: [], loyaltymembers: [] }
  for (const [tid, locs] of locsByTenant) {
    if (locs.length !== 1 || !tenantIdSet.has(tid)) continue
    if (slugOf(tid) === 'chopisburger') {
      results.skipped.push({ tenant: 'chopisburger', reason: 'revisión manual (decisión de Gonzalo)' })
      continue
    }
    const sedeId = locs[0]._id
    // sync_orders: tenantId y locationId son STRING (packages/db/src/models/sync-order.ts)
    const syncFilter = { tenantId: tid, locationId: null }
    const syncDocs = await db.collection('sync_orders').find(syncFilter).toArray()
    // loyaltymembers: tenantId y locationId son OBJECTID (apps/saas/models/LoyaltyMember.ts)
    const memFilter = { tenantId: new mongoose.Types.ObjectId(tid), locationId: null }
    const memDocs = await db.collection('loyaltymembers').find(memFilter).toArray()
    if (syncDocs.length === 0 && memDocs.length === 0) continue
    plan.push({ tid, sedeId, sedeName: locs[0].name, slug: slugOf(tid), syncFilter, memFilter })
    backupDocs.sync_orders.push(...syncDocs)
    backupDocs.loyaltymembers.push(...memDocs)
  }

  // RESPALDO previo a cualquier escritura
  const backup = {
    script: 'paso-b-prep.mjs apply-backfill',
    db: STAGING_DB,
    executedAt: new Date().toISOString(),
    action: 'backfill locationId = sede única en sync_orders y loyaltymembers',
    before,
    counts: { sync_orders: backupDocs.sync_orders.length, loyaltymembers: backupDocs.loyaltymembers.length },
    restore:
      'Reversible: para cada doc, $set { locationId: null } por _id en su colección ' +
      '(los _id completos están en este archivo).',
    sync_orders: backupDocs.sync_orders,
    loyaltymembers: backupDocs.loyaltymembers,
  }
  const backupFile = writeBackup('backfill-sede-unica.json', backup)

  // FASE 2: aplicar
  for (const step of plan) {
    const s = await db.collection('sync_orders').updateMany(step.syncFilter, { $set: { locationId: String(step.sedeId) } })
    if (s.modifiedCount > 0) results.syncOrders.push({ tenant: step.slug, sede: step.sedeName, modified: s.modifiedCount })
    const m = await db.collection('loyaltymembers').updateMany(step.memFilter, { $set: { locationId: step.sedeId } })
    if (m.modifiedCount > 0) results.loyaltyMembers.push({ tenant: step.slug, sede: step.sedeName, modified: m.modifiedCount })
  }

  const after = {
    syncOrdersNoLocation: await db.collection('sync_orders').countDocuments({ locationId: null }),
    loyaltyMembersNoLocation: await db.collection('loyaltymembers').countDocuments({ locationId: null }),
  }
  console.log(JSON.stringify({ mode: 'apply-backfill', backup: backupFile, before, after, ...results }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
// CREATE: usuarios de prueba
// ---------------------------------------------------------------------------
async function createTestUsers() {
  guardStaging()
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(STAGING_DB).db

  const TEST_ROLES = ['admin', 'manager', 'staff', 'cashier', 'seller', 'waiter']
  const TEST_TENANTS = ['palmyra', 'lacasetta-focaccia']
  const PASS = process.env.TEST_USER_PASS ?? 'TestPass1234!'
  const hash = await bcrypt.hash(PASS, 10)

  const tenants = await db.collection('tenants').find({ slug: { $in: TEST_TENANTS } }).toArray()
  const locations = await db.collection('locations').find({ tenantId: { $in: tenants.map(t => t._id) } }).toArray()

  const docs = []
  for (const t of tenants) {
    const locs = locations.filter(l => String(l.tenantId) === String(t._id)).sort((a, b) => String(a._id).localeCompare(String(b._id)))
    locs.forEach((loc, idx) => {
      for (const role of TEST_ROLES) {
        docs.push({
          name: `Test ${t.slug} ${role} S${idx + 1}`,
          email: `${t.slug}-${role}-s${idx + 1}@e2e.test`,
          password: hash,
          role,
          tenantId: t._id,
          assignedLocations: [loc._id],
          assignedTenants: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    })
  }

  const existing = await db.collection('users').find({ email: { $in: docs.map(d => d.email) } }, { projection: { email: 1 } }).toArray()
  const existingSet = new Set(existing.map(e => e.email))
  const toInsert = docs.filter(d => !existingSet.has(d.email))
  const skipped = docs.filter(d => existingSet.has(d.email)).map(d => d.email)

  let inserted = 0
  if (toInsert.length > 0) {
    const res = await db.collection('users').insertMany(toInsert)
    inserted = res.insertedCount
  }

  console.log(JSON.stringify({
    mode: 'create-test-users',
    inserted,
    skippedExisting: skipped,
    created: toInsert.map(d => ({
      email: d.email, role: d.role, tenantId: String(d.tenantId),
      assignedLocations: d.assignedLocations.map(String),
    })),
    note: 'waiter insertado via collection (User enum de mongoose no incluye waiter)',
  }, null, 2))
  await mongoose.disconnect()
}

// ---------------------------------------------------------------------------
const modes = {
  scan,
  'scan-prod': scanProd,
  'apply-locations': applyLocations,
  'apply-sync-tenant': applyGhostSync,
  'apply-backfill': applyBackfill,
  'create-test-users': createTestUsers,
}
const fn = modes[mode]
if (!fn) {
  console.error(`Modo desconocido: "${mode}". Opciones: ${Object.keys(modes).join(', ')}`)
  process.exit(1)
}
fn().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
