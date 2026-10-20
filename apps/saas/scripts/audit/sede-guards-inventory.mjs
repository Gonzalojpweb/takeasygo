#!/usr/bin/env node
// ============================================================================
// sede-guards-inventory.mjs — READ-ONLY: inventario de agentes + guards
// ============================================================================
// Uso:
//   MONGODB_URI=... node scripts/audit/sede-guards-inventory.mjs [--allow-prod]
//
// Reporta (sin escribir nada, sin imprimir secretos):
//   1. Por tenant/sede: impresoraAgent (lastSeenAt, version, tokenPresent)
//      → qué sedes ya están mandando código/version al poll de print-jobs.
//   2. Denegaciones registradas de los guards nuevos (últimos N días):
//      - auditlogs action=rbac.shadow_denied (sombra rbac.sedeScope)
//      - auditlogs de escritura de sede (locations.update|delete) fallidos
//        si existieran; los guards 403/404 de órdenes NO auditan (se cuenta
//        por presencia de registros igualmente).
//   3. Conteo de usuarios con user_location_roles (matriz v3).
//
// Salida: JSON a stdout. Sin tokens, sin phones, sin emails.
// ============================================================================
import mongoose from 'mongoose'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
const dbName = guardAgainstProd(uri, null)

const DIAS = (() => {
  const i = process.argv.indexOf('--dias')
  return i !== -1 ? Number(process.argv[i + 1]) : 30
})()

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const since = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000)

// ── 1. Agentes por sede ──────────────────────────────────────────────────────
const locations = await db.collection('locations').find(
  { isActive: true },
  { projection: { name: 1, slug: 1, tenantId: 1, printerAgent: 1 } }
).toArray()

const tenantIds = [...new Set(locations.map(l => String(l.tenantId)))]
const tenants = await db.collection('tenants').find(
  { _id: { $in: tenantIds.map(id => new mongoose.Types.ObjectId(id)) } },
  { projection: { slug: 1, name: 1 } }
).toArray()
const tenantSlug = new Map(tenants.map(t => [String(t._id), t.slug]))

const agents = locations
  .filter(l => l.printerAgent?.lastSeenAt)
  .map(l => ({
    tenant: tenantSlug.get(String(l.tenantId)) || '?',
    sede: l.name,
    locationId: String(l._id),
    lastSeenAt: l.printerAgent.lastSeenAt,
    version: l.printerAgent.version ?? null,
    tokenPresent: l.printerAgent.tokenPresent ?? null,
    diasSinPoll: Math.round((Date.now() - new Date(l.printerAgent.lastSeenAt)) / 86_400_000 * 10) / 10,
  }))
  .sort((a, b) => a.tenant.localeCompare(b.tenant) || a.sede.localeCompare(b.sede))

const nuncaVieron = locations
  .filter(l => !l.printerAgent?.lastSeenAt)
  .map(l => ({ tenant: tenantSlug.get(String(l.tenantId)) || '?', sede: l.name }))

// ── 2. Denegaciones de guards (auditlogs) ────────────────────────────────────
const shadowDenied = await db.collection('auditlogs')
  .find({ action: 'rbac.shadow_denied', createdAt: { $gte: since } })
  .project({ tenantId: 1, userId: 1, userRole: 1, createdAt: 1, locationId: 1, details: 1 })
  .toArray()

const shadowByRoute = new Map()
for (const d of shadowDenied) {
  const key = `${d.details?.route || '?'} | ${d.details?.permission || '?'} | rol=${d.details?.role || d.userRole || '?'}`
  shadowByRoute.set(key, (shadowByRoute.get(key) || 0) + 1)
}

const sedeWriteDenied = await db.collection('auditlogs')
  .find({
    action: { $in: ['locations.update', 'locations.delete', 'location.update', 'location.delete'] },
    createdAt: { $gte: since },
    ...(process.argv.includes('--incluye-ok') ? {} : { 'details.denied': true }),
  })
  .project({ action: 1, userId: 1, createdAt: 1, details: 1 })
  .limit(50)
  .toArray()

// ── 3. Matriz v3: filas user_location_roles ─────────────────────────────────
const ulrCount = await db.collection('user_location_roles').countDocuments({})
const ulrTenants = await db.collection('user_location_roles')
  .aggregate([{ $group: { _id: '$tenantId', n: { $sum: 1 } } }])
  .toArray()

// ── Flags actuales de multisede por tenant ──────────────────────────────────
const flagged = await db.collection('tenants').find(
  { 'flags.multisede.strictLocationId': { $exists: true } },
  { projection: { slug: 1, flags: 1 } }
).toArray()

const versionCount = new Map()
for (const a of agents) {
  const v = a.version || '(null)'
  versionCount.set(v, (versionCount.get(v) || 0) + 1)
}

console.log(JSON.stringify({
  db: dbName,
  generado: new Date().toISOString(),
  ventanaDias: DIAS,
  agentes: {
    conPoll: agents,
    nuncaVieronPoll: nuncaVieron,
    resumen: {
      totalSedesActivas: locations.length,
      conAgente: agents.length,
      conTokenPresent: agents.filter(a => a.tokenPresent).length,
      versiones: Object.fromEntries(versionCount),
    },
  },
  guards: {
    rbacShadowDenied: { total: shadowDenied.length, porRuta: Object.fromEntries(shadowByRoute) },
    sedeWriteDenied: sedeWriteDenied.length,
    sedeWriteDeniedEjemplos: sedeWriteDenied.slice(0, 5).map(d => ({
      action: d.action, userId: String(d.userId), createdAt: d.createdAt, details: d.details,
    })),
  },
  matrizV3: { filasULR: ulrCount, porTenant: ulrTenants.map(t => ({ tenantId: String(t._id), filas: t.n })) },
  flagsConValor: flagged.map(t => ({
    slug: t.slug,
    strictLocationId: t.flags?.['multisede.strictLocationId'] ?? null,
    rbacSedeScope: t.flags?.['rbac.sedeScope'] ?? null,
    cashSede: t.flags?.['multisede.cashSede'] ?? null,
    numbering: t.flags?.['numbering.perLocation'] ?? null,
    mpPerLocation: t.flags?.['mp.perLocation'] ?? null,
    configLayers: t.flags?.['config.layers'] ?? null,
  })),
}, null, 2))

await mongoose.disconnect()
