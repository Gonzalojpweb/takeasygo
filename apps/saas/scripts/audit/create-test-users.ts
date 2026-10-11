// ============================================================================
// create-test-users.ts — Usuarios de prueba por rol/sede (STAGING ONLY)
// ============================================================================
// Crea usuarios de prueba en palmyra y lacasetta-focaccia para la batería
// anti-cruce: 6 roles (admin, manager, staff, cashier, seller, waiter) x
// cada sede de cada tenant.
//
// - Vía normal: usa el modelo User de la app (validación de enum + hash
//   bcrypt en el hook pre('save')). NO inserta crudo en la colección.
// - Contraseña ALEATORIA por usuario (crypto.randomBytes), guardada en
//   archivos FUERA del repo / gitignored. NUNCA se imprime en stdout.
// - ALLOWLIST: solo corre contra `takeasygo-staging` (exit 2 en otro target).
//
// Uso:
//   $env:MONGODB_URI = "<uri staging>"; npx tsx scripts/audit/create-test-users.ts --db takeasygo-staging
// ============================================================================

import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import User from '../../models/User'

const ALLOWED_DB = 'takeasygo-staging'
const TEST_ROLES = ['admin', 'manager', 'staff', 'cashier', 'seller', 'waiter'] as const
const TEST_TENANTS = ['palmyra', 'lacasetta-focaccia'] as const
const PROD_DB_NAME = 'test'

/** Copiado de scripts/audit/_safety.mjs (evita importar .mjs sin tipos). */
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
  const dbName = dbIdx >= 0 ? argv[dbIdx + 1] : null
  const effective = resolveDbName(uri, dbName)
  if (effective !== ALLOWED_DB) {
    console.error('')
    console.error('============================================================')
    console.error(`  BLOQUEADO: este script solo corre contra ${ALLOWED_DB}`)
    console.error(`  Base efectiva: "${effective}"`)
    console.error('============================================================')
    process.exit(2)
  }

  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.useDb(ALLOWED_DB).db

  const before = { users: await db.collection('users').countDocuments({}) }

  const tenants = await db
    .collection('tenants')
    .find({ slug: { $in: [...TEST_TENANTS] } })
    .toArray()
  const locations = await db
    .collection('locations')
    .find({ tenantId: { $in: tenants.map(t => t._id) } })
    .toArray()

  const credentials: Array<{ email: string; password: string; role: string; tenant: string; sede: string }> = []
  const created: Array<{ email: string; role: string; tenant: string; sede: string }> = []
  const skipped: string[] = []

  for (const t of tenants) {
    const locs = locations
      .filter(l => String(l.tenantId) === String(t._id))
      .sort((a, b) => String(a._id).localeCompare(String(b._id)))
    for (let idx = 0; idx < locs.length; idx++) {
      const loc = locs[idx]
      for (const role of TEST_ROLES) {
        const email = `${t.slug}-${role}-s${idx + 1}@e2e.test`
        const exists = await User.exists({ email })
        if (exists) {
          skipped.push(email)
          continue
        }
        const password = `${randomBytes(18).toString('base64url')}!Aa1`
        // models/User.ts NO tiene hook pre-save: el hash debe ser explícito
        const passwordHash = await bcrypt.hash(password, 10)
        await User.create({
          name: `Test ${t.slug} ${role} S${idx + 1}`,
          email,
          password: passwordHash,
          role,
          tenantId: t._id,
          assignedLocations: [loc._id],
          assignedTenants: [],
          isActive: true,
        })
        credentials.push({ email, password, role, tenant: t.slug, sede: loc.name })
        created.push({ email, role, tenant: t.slug, sede: loc.name })
      }
    }
  }

  // Credenciales: SOLO fuera del repo (TEMP). No escribir en el directorio
  // del proyecto: está en Dropbox y se sincronizaría.
  const credPaths: string[] = []
  if (credentials.length > 0) {
    const payload = {
      note: 'Usuarios de prueba de STAGING. No commitear. Generado por create-test-users.ts',
      generatedAt: new Date().toISOString(),
      db: ALLOWED_DB,
      users: credentials,
    }
    const tempDir = join(process.env.TEMP ?? '.', 'opencode', `staging-backup-${new Date().toISOString().slice(0, 10)}`)
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
    const tempFile = join(tempDir, 'test-users-credentials.json')
    writeFileSync(tempFile, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
    credPaths.push(tempFile)
  }

  const after = { users: await db.collection('users').countDocuments({}) }
  console.log(JSON.stringify({
    mode: 'create-test-users',
    db: ALLOWED_DB,
    before,
    after,
    createdCount: created.length,
    created,
    skippedExisting: skipped,
    credentialsFiles: credPaths,
    note: 'contraseñas NO impresas; ver archivos de credenciales (fuera del repo / gitignored)',
  }, null, 2))

  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
