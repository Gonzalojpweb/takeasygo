#!/usr/bin/env node
// Clasifica rutas app/api/[tenant] por chequeo de sesion y match de tenant.
// - A: sin ningun chequeo de sesion        -> acceso sin login
// - B: chequea sesion pero NO matchea tenant -> cualquier logueado (p.ej. tenantId null) cruza
// - C: sesion + match de tenant            -> cerrado para tenantId null/ajeno
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] ?? 'app/api')
const rows = []

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(process.cwd(), file)
  // Guards que YA matchean tenant internamente (reciben tenantId)
  const guardMatchesTenant =
    /requireAuth\(|requireAdminRole\(|getSessionForTenant\(/.test(src)
  // Cualquier chequeo de sesion
  const hasAuth =
    guardMatchesTenant ||
    /requireSuperAdmin\(|getSessionUser\b|getToken\(|await auth\(\)|verifyPosToken\(/.test(src)
  // Match de tenant hecho inline en la ruta
  const inlineTenantMatch =
    /token\.tenantId|user\.tenantId|session\.user\.tenantId|belongsToTenant|payload\.tenantId/.test(
      src
    )
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) =>
    new RegExp(`export async function ${m}\\b|export const ${m}\\b`).test(src)
  )
  const cls = !hasAuth
    ? 'A-sin-sesion'
    : guardMatchesTenant || inlineTenantMatch || /requireSuperAdmin\(/.test(src)
      ? 'C-cerrado'
      : 'B-sesion-sin-match-tenant'
  rows.push({ cls, methods: methods.join(','), file: rel })
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name === 'route.ts') yield p
  }
}

const byClass = {}
for (const r of rows) (byClass[r.cls] ??= []).push(r)
for (const [cls, list] of Object.entries(byClass)) {
  const writes = list.filter((r) => /POST|PUT|PATCH|DELETE/.test(r.methods))
  console.log(`\n## ${cls}: ${list.length} rutas (escritura: ${writes.length})`)
  for (const r of list) console.log(`  [${r.methods}] ${r.file}`)
}
