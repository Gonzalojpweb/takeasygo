#!/usr/bin/env node
// =====================================================================
// prod-password-format-scan.mjs — SOLO LECTURA en producción (--allow-prod)
// =====================================================================
// Cuenta usuarios cuya password NO tiene formato bcrypt ($2…). Objetivo:
// detectar credenciales guardadas en texto plano (riesgo máximo).
// Reporta SOLO conteos y slugs de tenant. Nunca valores ni correos.
// =====================================================================
import mongoose from 'mongoose'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const dbName = guardAgainstProd(uri, null)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const total = await db.collection('users').countDocuments()
const sinPassword = await db.collection('users').countDocuments({
  $or: [{ password: null }, { password: { $exists: false } }, { password: '' }],
})
const conPassword = total - sinPassword

// Formato bcrypt: $2a$ / $2b$ / $2y$
const noBcryptDocs = await db
  .collection('users')
  .find(
    { password: { $exists: true, $nin: [null, ''], $not: /^\$2[aby]\$/ } },
    { projection: { tenantId: 1, role: 1, isActive: 1 } }
  )
  .toArray()

const tenantIds = [...new Set(noBcryptDocs.map((d) => String(d.tenantId ?? '')))]
const tenants = await db
  .collection('tenants')
  .find({ _id: { $in: tenantIds.filter(Boolean).map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { slug: 1 } })
  .toArray()
const slugById = new Map(tenants.map((t) => [String(t._id), t.slug]))

const byTenant = {}
for (const d of noBcryptDocs) {
  const key = d.tenantId ? (slugById.get(String(d.tenantId)) ?? 'TENANT_FANTASMA') : 'SIN_TENANT'
  byTenant[key] = (byTenant[key] ?? 0) + 1
}
const byRole = {}
for (const d of noBcryptDocs) {
  byRole[d.role ?? 'sin-rol'] = (byRole[d.role ?? 'sin-rol'] ?? 0) + 1
}

const report = {
  scannedAt: new Date().toISOString(),
  db: dbName,
  totalUsers: total,
  sinPassword,
  conPassword,
  passwordNoBcrypt: noBcryptDocs.length,
  passwordBcrypt: conPassword - noBcryptDocs.length,
  noBcryptByTenant: byTenant,
  noBcryptByRole: byRole,
  note: 'Solo conteos y slugs; sin correos ni valores.',
}

const outFile = join(process.env.TEMP ?? '.', 'opencode', 'prod-password-format-scan.json')
writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
console.log(`evidencia: ${outFile}`)

await mongoose.disconnect()
