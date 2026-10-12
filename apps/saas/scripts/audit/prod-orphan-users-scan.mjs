#!/usr/bin/env node
// =====================================================================
// prod-orphan-users-scan.mjs — SOLO LECTURA en producción (--allow-prod)
// =====================================================================
// Usuarios con password cuyo tenantId no existe (o es nulo). Muestra
// fechas y el timestamp embebido en el ObjectId del tenant referenciado:
// si el tenant "se creó" el día X y el usuario se logueó después, el
// tenant existió y fue borrado posteriormente (no es error de registro).
// Sin correos: solo name/role/fechas. Evidencia: %TEMP%\opencode\.
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

const users = await db
  .collection('users')
  .find(
    { password: { $exists: true, $nin: [null, ''] } },
    { projection: { name: 1, role: 1, tenantId: 1, createdAt: 1, lastLoginAt: 1, isActive: 1 } }
  )
  .toArray()

const tenantIds = [...new Set(users.map((u) => u.tenantId).filter(Boolean).map(String))]
const existing = await db
  .collection('tenants')
  .find({ _id: { $in: tenantIds.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { slug: 1 } })
  .toArray()
const existingSet = new Set(existing.map((t) => String(t._id)))

function objectIdDate(id) {
  try {
    return new mongoose.Types.ObjectId(id).getTimestamp().toISOString()
  } catch {
    return null
  }
}

const orphans = users
  .filter((u) => !u.tenantId || !existingSet.has(String(u.tenantId)))
  .map((u) => ({
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt?.toISOString?.() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString?.() ?? null,
    tenantIdPresent: Boolean(u.tenantId),
    tenantObjectIdCreatedAt: u.tenantId ? objectIdDate(u.tenantId) : null,
  }))

const report = {
  scannedAt: new Date().toISOString(),
  db: dbName,
  totalUsersWithPassword: users.length,
  orphanCount: orphans.length,
  orphanNeverLoggedIn: orphans.filter((o) => !o.lastLoginAt).length,
  orphanLoggedIn: orphans.filter((o) => o.lastLoginAt).length,
  orphans,
  note: 'name/role/fechas sin correos. tenantObjectIdCreatedAt = timestamp del ObjectId del tenant referenciado.',
}

const outFile = join(process.env.TEMP ?? '.', 'opencode', 'prod-orphan-users-scan.json')
writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({ ...report, orphans: orphans.filter((o) => o.lastLoginAt) }, null, 2))
console.log(`evidencia completa (con nunca-logueados): ${outFile}`)

await mongoose.disconnect()
