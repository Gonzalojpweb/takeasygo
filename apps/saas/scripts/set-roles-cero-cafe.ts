/**
 * Lista / actualiza roles de los usuarios del tenant cero-cafe.
 *
 *   npx tsx apps/saas/scripts/set-roles-cero-cafe.ts            (dry-run: lista)
 *   npx tsx apps/saas/scripts/set-roles-cero-cafe.ts --apply    (aplica)
 *
 * Reglas:
 *   - cerocafedeorigin@gmail.com -> admin
 *   - martin -> manager, sofia -> manager
 */

import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function uriFromEnvFile(file: string): string {
  if (!existsSync(file)) return ''
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const TENANT_SLUG = 'cero-cafe'
// El usuario escribio "cerocafedeorigin@gmail.com"; en la base figura como
// cerocafedeorigen@gmail.com. Match por prefijo para cubrir ambos.
const NEW_ADMIN_PREFIX = 'cerocafedeorig'
const MANAGER_MATCH = ['martin', 'sofia'] // contra nombre o email

async function main() {
  const apply = process.argv.includes('--apply')

  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) { console.error('No MONGODB_URI found'); process.exit(1) }

  console.log(`(${apply ? 'APPLY' : 'DRY-RUN'})`)
  await mongoose.connect(uri)

  const db = mongoose.connection.db!
  const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG, isActive: true }) as any
  if (!tenant) { console.error('Tenant not found'); process.exit(1) }

  const users = await db.collection('users').find({ tenantId: tenant._id }).toArray() as any[]
  console.log(`Tenant: ${tenant.name} — ${users.length} usuarios:\n`)

  const updates: Array<{ _id: any; from: string; to: string; who: string }> = []
  const effective: string[] = []

  for (const u of users) {
    const email = (u.email || '').toLowerCase()
    const name = (u.name || '').toLowerCase()
    let target = u.role
    if (email.startsWith(NEW_ADMIN_PREFIX)) target = 'admin'
    else if (MANAGER_MATCH.some(n => name.includes(n) || email.includes(n))) target = 'manager'
    effective.push(target)

    const flag = target !== u.role ? `  -> ${target}` : '  (ok)'
    console.log(`  ${u.name} <${u.email}> rol=${u.role} act=${u.isActive !== false}${flag}`)
    if (target !== u.role) updates.push({ _id: u._id, from: u.role, to: target, who: `${u.name} <${u.email}>` })
  }

  const adminCount = effective.filter(r => r === 'admin').length
  console.log(`\nAdmins resultantes: ${adminCount} (debe ser 1: cuenta cerocafedeorig...)`)

  if (!apply) {
    console.log(`\nDry-run: ${updates.length} cambio(s) pendientes. Correr con --apply para escribir.`)
  } else if (updates.length) {
    for (const up of updates) {
      await db.collection('users').updateOne({ _id: up._id }, { $set: { role: up.to } })
      console.log(`✔ ${up.who}: ${up.from} -> ${up.to}`)
    }
    console.log('Listo.')
  } else {
    console.log('\nNada que cambiar.')
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
