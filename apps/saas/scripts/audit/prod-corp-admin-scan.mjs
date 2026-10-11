#!/usr/bin/env node
// =====================================================================
// prod-corp-admin-scan.mjs — SOLO LECTURA en producción (--allow-prod)
// =====================================================================
// Cuenta cuentas corporativas cuyo companyAdminEmail NO tiene ningún
// User en el sistema (sin cuenta de acceso). Motivo: preparar el cierre
// de business/corp/* con sesión NextAuth + match de email; las cuentas
// sin usuario necesitan un flujo de verificación por email antes.
// Reporta SOLO conteos y nombres de empresa; nunca correos.
// =====================================================================
import mongoose from 'mongoose'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const dbName = guardAgainstProd(uri, null)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const accounts = await db
  .collection('corporateaccounts')
  .find({}, { projection: { companyName: 1, companyAdminEmail: 1, status: 1, employeeEmails: 1, tenantIds: 1 } })
  .toArray()

const byStatus = {}
for (const a of accounts) byStatus[a.status ?? 'sin-status'] = (byStatus[a.status ?? 'sin-status'] ?? 0) + 1

const active = accounts.filter((a) => a.status === 'active')

// Emails de admin en minúscula (el schema lowercase: true)
const adminEmails = [...new Set(active.map((a) => (a.companyAdminEmail ?? '').toLowerCase().trim()).filter(Boolean))]

// ¿Existe algún User con ese email? (case-insensitive: users guardados en minúscula por modelo)
const usersWithEmail = await db
  .collection('users')
  .find({ email: { $in: adminEmails } }, { projection: { email: 1 } })
  .toArray()
const usersWithAdminEmail = new Set(usersWithEmail.map((u) => (u.email ?? '').toLowerCase().trim()))

const sinUsuario = []
const conUsuario = []
for (const a of active) {
  const email = (a.companyAdminEmail ?? '').toLowerCase().trim()
  const row = { companyName: a.companyName, employeeCount: (a.employeeEmails ?? []).length }
  if (usersWithAdminEmail.has(email)) conUsuario.push(row)
  else sinUsuario.push(row)
}

// Empleados declarados que tampoco tienen User (contexto para el diseño de verificación)
const employeeEmails = [...new Set(
  active.flatMap((a) => (a.employeeEmails ?? []).map((e) => (e ?? '').toLowerCase().trim())).filter(Boolean)
)]
const usersWithEmployeeEmail = await db
  .collection('users')
  .find({ email: { $in: employeeEmails } }, { projection: { email: 1 } })
  .toArray()
const employeesWithoutUser = employeeEmails.length - usersWithEmployeeEmail.length

const report = {
  scannedAt: new Date().toISOString(),
  db: dbName,
  totalCorporateAccounts: accounts.length,
  byStatus,
  activeAccounts: active.length,
  activeWithAdminUser: conUsuario.length,
  activeWithoutAdminUser: sinUsuario.length,
  sinUsuarioCompanies: sinUsuario.map((s) => s.companyName),
  conUsuarioCompanies: conUsuario.map((s) => s.companyName),
  distinctEmployeeEmails: employeeEmails.length,
  employeesWithoutUser,
  note: 'Solo conteos y nombres de empresa; sin correos.',
}

const outFile = join(process.env.TEMP ?? '.', 'opencode', 'prod-corp-admin-scan.json')
writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
console.log(`evidencia: ${outFile}`)

await mongoose.disconnect()
