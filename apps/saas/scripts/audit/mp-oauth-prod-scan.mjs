#!/usr/bin/env node
// =====================================================================
// mp-oauth-prod-scan.mjs — SOLO LECTURA en producción (--allow-prod)
// =====================================================================
// 1. Estado de cuentas Mercado Pago por tenant: fechas de autorización
//    OAuth, conectadas/no, mpOAuth legacy. Solo conteos y slugs + fechas.
// 2. Usuarios con contraseña y tenantId nulo/inexistente: propósito
//    (rol, nombre, último login, creación). Sin correos.
// =====================================================================
import mongoose from 'mongoose'
import { writeFileSync } from 'node:fs'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const dbName = guardAgainstProd(uri, null)
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

// ---------- 1. Mercado Pago OAuth ----------
const tenants = await db
  .collection('tenants')
  .find(
    { $or: [{ 'mpAccounts.0': { $exists: true } }, { 'mpOAuth.isConnected': true }, { 'mpOAuth.authorizedAt': { $exists: true } }] },
    { projection: { slug: 1, updatedAt: 1, mpAccounts: 1, mpOAuth: 1 } }
  )
  .toArray()

const mp = {
  tenantsWithMp: tenants.length,
  accountsTotal: 0,
  accountsConnected: 0,
  accountsAuthorized: 0,
  authorizedLast7d: 0,
  authorizedLast30d: 0,
  authorizedLast90d: 0,
  authorizedLast365d: 0,
  connectedWithoutAuthorizedAt: 0,
  authorizedButNotConnected: 0,
  legacyConnected: 0,
  tenantsUpdatedLast30d: [],
  perTenant: [],
}

for (const t of tenants) {
  const accounts = t.mpAccounts ?? []
  const rows = []
  for (const a of accounts) {
    mp.accountsTotal++
    const at = a.oauthAuthorizedAt ? new Date(a.oauthAuthorizedAt) : null
    if (a.oauthIsConnected) mp.accountsConnected++
    if (at) {
      mp.accountsAuthorized++
      const d = Date.now() - at.getTime()
      if (d <= 7 * 86_400_000) mp.authorizedLast7d++
      if (d <= 30 * 86_400_000) mp.authorizedLast30d++
      if (d <= 90 * 86_400_000) mp.authorizedLast90d++
      if (d <= 365 * 86_400_000) mp.authorizedLast365d++
      if (a.oauthIsConnected === false) mp.authorizedButNotConnected++
    }
    if (a.oauthIsConnected && !at) mp.connectedWithoutAuthorizedAt++
    rows.push({
      connected: !!a.oauthIsConnected,
      authorizedAt: at ? at.toISOString() : null,
      isActive: a.isActive !== false,
      hasTokens: !!(a.oauthAccessToken || a.accessToken),
    })
  }
  const legacy = t.mpOAuth?.isConnected ? { connected: true, authorizedAt: t.mpOAuth.authorizedAt ? new Date(t.mpOAuth.authorizedAt).toISOString() : null } : null
  if (legacy) mp.legacyConnected++
  if (t.updatedAt && new Date(t.updatedAt) > daysAgo(30)) mp.tenantsUpdatedLast30d.push(t.slug)
  mp.perTenant.push({ slug: t.slug, accounts: rows, legacy })
}

// ---------- 2. Usuarios con password y tenant fantasma/nulo ----------
const tenantIds = new Set((await db.collection('tenants').distinct('_id')).map(String))
const cursor = db.collection('users').find({ password: { $ne: null } }, { projection: { email: 1, name: 1, role: 1, tenantId: 1, isActive: 1, lastLoginAt: 1, createdAt: 1, assignedLocations: 1 } })
const orphans = []
for await (const u of cursor) {
  const tid = u.tenantId ? String(u.tenantId) : null
  if (tid && tenantIds.has(tid)) continue
  orphans.push({
    name: u.name || '(sin nombre)',
    role: u.role,
    tenantStatus: tid ? 'inexistente' : 'nulo',
    isActive: !!u.isActive,
    lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
    assignedLocations: (u.assignedLocations ?? []).length,
  })
}

const report = {
  db: dbName,
  date: new Date().toISOString(),
  readOnly: true,
  mpOauth: mp,
  orphanAccounts: {
    total: orphans.length,
    byRole: orphans.reduce((acc, u) => ((acc[u.role] = (acc[u.role] ?? 0) + 1), acc), {}),
    active: orphans.filter((u) => u.isActive).length,
    neverLoggedIn: orphans.filter((u) => !u.lastLoginAt).length,
    loggedInLast30d: orphans.filter((u) => u.lastLoginAt && new Date(u.lastLoginAt) > daysAgo(30)).length,
    list: orphans,
  },
}

const out = `${process.env.TEMP ?? '/tmp'}/opencode/prod-mp-oauth-scan.json`
try {
  writeFileSync(out, JSON.stringify(report, null, 2))
  report.savedTo = out
} catch {}

console.log(JSON.stringify(report, null, 2))
await mongoose.disconnect()
