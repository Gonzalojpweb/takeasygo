#!/usr/bin/env node
// =====================================================================
// prod-print-activity-scan.mjs — SOLO LECTURA en producción (--allow-prod)
// =====================================================================
// Lista sedes con actividad de impresión en los últimos 30 días:
// - órdenes con printLog.printedAt en la ventana
// - pre-close jobs con updatedAt en la ventana (cualquier estado)
// Reporta también la última versión del agente conocida (Location.printerAgent.version),
// que empieza a poblarse con la fase 1 del token (heartbeat de print-jobs).
// Reporta solo conteos; nunca datos de clientes.
// =====================================================================
import mongoose from 'mongoose'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const dbName = guardAgainstProd(uri, null)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

const printLogAgg = await db.collection('orders').aggregate([
  { $match: { 'printLog.printedAt': { $gte: since } } },
  { $unwind: '$printLog' },
  { $match: { 'printLog.printedAt': { $gte: since } } },
  {
    $group: {
      _id: '$locationId',
      impresiones: { $sum: 1 },
      errores: { $sum: { $cond: ['$printLog.success', 0, 1] } },
      ultima: { $max: '$printLog.printedAt' },
    },
  },
]).toArray()

const preCloseAgg = await db.collection('precloseprintjobs').aggregate([
  { $match: { updatedAt: { $gte: since } } },
  {
    $group: {
      _id: '$locationId',
      jobs: { $sum: 1 },
      errores: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
      ultima: { $max: '$updatedAt' },
    },
  },
]).toArray()

const locations = await db.collection('locations').find({}, {
  projection: { name: 1, slug: 1, tenantId: 1, isActive: 1, printerAgent: 1 },
}).toArray()
const byId = new Map(locations.map((l) => [String(l._id), l]))

const tenantIds = [...new Set(locations.map((l) => String(l.tenantId)))]
const tenants = await db.collection('tenants').find(
  { _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) } },
  { projection: { slug: 1 } }
).toArray()
const tenantSlug = new Map(tenants.map((t) => [String(t._id), t.slug]))

const merged = new Map()
for (const row of [...printLogAgg, ...preCloseAgg]) {
  const key = String(row._id)
  const prev = merged.get(key) || { impresiones: 0, errores: 0, jobs: 0, ultima: null }
  if ('impresiones' in row) {
    prev.impresiones += row.impresiones
    prev.errores += row.errores
  } else {
    prev.jobs += row.jobs
    prev.errores += row.errores
  }
  if (!prev.ultima || row.ultima > prev.ultima) prev.ultima = row.ultima
  merged.set(key, prev)
}

const rows = [...merged.entries()]
  .map(([locId, stats]) => {
    const loc = byId.get(locId)
    return {
      tenant: loc ? tenantSlug.get(String(loc.tenantId)) ?? '?' : '(location borrada)',
      sede: loc ? `${loc.name} (${loc.slug})` : locId,
      activa: loc?.isActive ?? null,
      impresiones: stats.impresiones,
      preCloseJobs: stats.jobs,
      errores: stats.errores,
      ultimaActividad: stats.ultima?.toISOString?.() ?? null,
      versionAgente: loc?.printerAgent?.version ?? null,
      agenteVisto: loc?.printerAgent?.lastSeenAt?.toISOString?.() ?? null,
    }
  })
  .sort((a, b) => (b.impresiones + b.preCloseJobs) - (a.impresiones + a.preCloseJobs))

console.log(`Sedes con actividad de impresión (30d) — base: ${dbName}`)
console.log(JSON.stringify(rows, null, 2))
console.log(`\nTotal: ${rows.length} sedes`)

await mongoose.disconnect()
