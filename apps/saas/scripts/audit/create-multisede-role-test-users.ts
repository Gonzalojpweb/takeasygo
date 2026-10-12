// ============================================================================
// create-multisede-role-test-users.ts — Usuarios de prueba por rol (STAGING)
// ============================================================================
// Crea un usuario por rol (admin, manager, cashier, waiter, host, auditor,
// staff, seller) en cada tenant multisede activo de staging. Las credenciales
// se guardan en %TEMP%\opencode (FUERA del repo y de Dropbox); NUNCA se
// imprimen en stdout.
//
// Uso:
//   $env:MONGODB_URI = "<uri staging>"; npx tsx scripts/audit/create-multisede-role-test-users.ts --db takeasygo-staging
// ============================================================================

import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import bcrypt from 'bcryptjs'
import User from '../../models/User'

const ALLOWED_DB = 'takeasygo-staging'
const TEST_ROLES = ['admin', 'manager', 'cashier', 'waiter', 'host', 'auditor', 'staff', 'seller'] as const
const PROD_DB_NAME = 'test'

function resolveDbName(uri: string, explicitDb?: string | null): string {
  if (explicitDb) return explicitDb
  const noQuery = String(uri).split('?')[0]
  const afterScheme = noQuery.replace(/^[a-z0-9+.-]+:\/\//i, '')
  const slash = afterScheme.indexOf('/')
  if (slash === -1) return PROD_DB_NAME
  const path = afterScheme.slice(slash + 1).trim()
  return path === '' ? PROD_DB_NAME : path
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Falta MONGODB_URI.')
    process.exit(1)
  }

  const argv = process.argv.slice(2)
  const dbIdx = argv.indexOf('--db')
  const effective = resolveDbName(uri, dbIdx >= 0 ? argv[dbIdx + 1] : null)
  if (effective !== ALLOWED_DB) {
    console.error(`BLOQUEADO: este script solo corre contra ${ALLOWED_DB} (base efectiva: "${effective}").`)
    process.exit(2)
  }

  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(ALLOWED_DB).db

  // Tenants multisede activos (>= 2 sedes activas)
  const multi = await db.collection('locations').aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$tenantId', n: { $sum: 1 } } },
    { $match: { n: { $gte: 2 } } },
  ]).toArray()
  const tenants = await db
    .collection('tenants')
    .find({ _id: { $in: multi.map(m => m._id) }, isActive: true }, { projection: { slug: 1 } })
    .toArray()

  const credentials: Array<{ tenant: string; role: string; email: string; password: string }> = []
  const created: string[] = []
  const skipped: string[] = []

  for (const t of tenants) {
    for (const role of TEST_ROLES) {
      const email = `${t.slug}-${role}@e2e.test`
      const exists = await User.exists({ email })
      if (exists) {
        skipped.push(email)
        continue
      }
      const password = `${randomBytes(18).toString('base64url')}!Aa1`
      const passwordHash = await bcrypt.hash(password, 10)
      await User.create({
        name: `Test ${t.slug} ${role}`,
        email,
        password: passwordHash,
        role,
        tenantId: t._id,
        isActive: true,
      })
      credentials.push({ tenant: t.slug, role, email, password })
      created.push(email)
    }
  }

  const out = join(tmpdir(), 'opencode', 'staging-role-test-users.json')
  mkdirSync(join(tmpdir(), 'opencode'), { recursive: true })
  writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), credentials }, null, 2))

  console.log(`Tenants multisede: ${tenants.map(t => t.slug).join(', ')}`)
  console.log(`Creados: ${created.length} | Ya existían: ${skipped.length}`)
  console.log(`Credenciales (NO en el repo): ${out}`)
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
