// ============================================================================
// enable-flags.mjs — Enciende/apaga feature flags por tenant en una base
// ============================================================================
// Uso:
//   MONGODB_URI=... node enable-flags.mjs --tenant chopisburger --db takeasygo-staging --set
//   MONGODB_URI=... node enable-flags.mjs --tenant chopisburger --db takeasygo-staging --clear
//
// --set   enciende los 6 flags multisede en true
// --clear los pone en false (rollback por flag)
//
// Guarda backup del estado previo de flags en C:\takeasygo-backups\flags-*.json
// ============================================================================

import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'

const argv = process.argv.slice(2)

const tenantIdx = argv.indexOf('--tenant')
const tenantSlug = tenantIdx >= 0 ? argv[tenantIdx + 1] : null
const dbArgIdx = argv.indexOf('--db')
const dbNameArg = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null
const setMode = argv.includes('--set')
const clearMode = argv.includes('--clear')

if (!tenantSlug) {
  console.error('Uso: node enable-flags.mjs --tenant <slug> [--db <nombre>] --set|--clear')
  process.exit(2)
}

if (!setMode && !clearMode) {
  console.error('Especificar --set o --clear')
  process.exit(2)
}

const FLAG_KEYS = [
  'multisede.strictLocationId',
  'rbac.sedeScope',
  'config.layers',
  'multisede.cashSede',
  'numbering.perLocation',
  'mp.perLocation',
]

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI')
  process.exit(2)
}

const dbName = guardAgainstProd(uri, dbNameArg)
console.log(`Base efectiva: ${dbName}`)

const backupDir = process.env.TAKEASYGO_BACKUP_DIR || 'C:\\takeasygo-backups'
if (backupDir.toLowerCase().includes('dropbox') || backupDir.includes('takeasygo\\')) {
  console.error(`BLOQUEADO: carpeta de backup sospechosa: ${backupDir}`)
  process.exit(2)
}
fs.mkdirSync(backupDir, { recursive: true })

async function main() {
  await mongoose.connect(uri, { dbName })
  const db = mongoose.connection.db
  const tenants = db.collection('tenants')

  const tenant = await tenants.findOne({ slug: tenantSlug })
  if (!tenant) {
    console.error(`Tenant no encontrado: ${tenantSlug}`)
    process.exit(1)
  }

  const prevFlags = tenant.flags || {}
  const backupFile = path.join(backupDir, `flags-${tenantSlug}-${Date.now()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ tenantSlug, prevFlags, setMode }, null, 2))
  console.log(`Backup previo: ${backupFile}`)

  const newFlags = { ...prevFlags }
  for (const key of FLAG_KEYS) {
    newFlags[key] = setMode
  }

  await tenants.updateOne({ _id: tenant._id }, { $set: { flags: newFlags } })
  console.log(`Flags ${setMode ? 'ENCENDIDOS' : 'APAGADOS'} para ${tenantSlug}:`)
  for (const key of FLAG_KEYS) {
    console.log(`  ${key}: ${newFlags[key]}`)
  }

  await mongoose.disconnect()
  console.log('Listo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
