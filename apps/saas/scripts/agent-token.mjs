#!/usr/bin/env node
// =====================================================================
// agent-token.mjs — Genera/rota el token del agente de impresión (por sede)
// =====================================================================
// Uso:
//   node scripts/agent-token.mjs generate --tenant <slug> --location <locationId|slug>
//   node scripts/agent-token.mjs revoke   --tenant <slug> --location <locationId|slug>
//
// generate: crea un token aleatorio (64 hex), guarda SOLO el SHA-256 en
//           Location.printerAgent.secretHash e imprime el token UNA vez.
//           Copialo al config.json del agente (agentToken) o pasalo por setup.js.
// revoke:   borra el hash (los agentes con el token viejo dejan de matchear).
//
// Escribir contra prod requiere --allow-prod (base `test`).
// =====================================================================
import mongoose from 'mongoose'
import crypto from 'node:crypto'
import { guardAgainstProd } from './audit/_safety.mjs'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : null
}

const action = process.argv[2]
const tenantSlug = arg('--tenant')
const locationRef = arg('--location')

if (!['generate', 'revoke'].includes(action) || !tenantSlug || !locationRef) {
  console.error('Uso: node scripts/agent-token.mjs generate|revoke --tenant <slug> --location <id|slug>')
  process.exit(1)
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const dbName = guardAgainstProd(uri, null)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const tenant = await db.collection('tenants').findOne({ slug: tenantSlug, isActive: true })
if (!tenant) {
  console.error(`Tenant "${tenantSlug}" no encontrado (o inactivo).`)
  process.exit(1)
}

const location = await db.collection('locations').findOne({
  tenantId: tenant._id,
  $or: [{ _id: mongoose.isValidObjectId(locationRef) ? new mongoose.Types.ObjectId(locationRef) : null }, { slug: locationRef }],
  isActive: true,
})
if (!location) {
  console.error(`Sede "${locationRef}" no encontrada en ${tenantSlug} (o inactiva).`)
  process.exit(1)
}

if (action === 'generate') {
  const token = crypto.randomBytes(32).toString('hex')
  const secretHash = crypto.createHash('sha256').update(token).digest('hex')
  await db.collection('locations').updateOne(
    { _id: location._id },
    { $set: { 'printerAgent.secretHash': secretHash } }
  )
  console.log('')
  console.log(`Sede: ${location.name} (${tenantSlug})`)
  console.log('')
  console.log('  Token del agente (se muestra UNA sola vez, no se guarda en claro):')
  console.log('')
  console.log(`    ${token}`)
  console.log('')
  console.log('  Copialo al config.json del agente: "agentToken": "<token>"')
  console.log('  (o ejecutá printer-agent/setup.js y pegalo cuando lo pida)')
  console.log('')
} else {
  await db.collection('locations').updateOne(
    { _id: location._id },
    { $set: { 'printerAgent.secretHash': null } }
  )
  console.log(`Token revocado para ${location.name} (${tenantSlug}).`)
}

await mongoose.disconnect()
console.log(`OK (base: ${dbName}).`)
