// ============================================================================
// location-prefix-backfill.mjs — Backfill de prefijos de sede existentes
// ============================================================================
// Calcula y guarda `prefix` para cada sede existente que no lo tenga.
//
// Reglas:
//   1. Si la sede ya tiene prefix → se respeta, no se toca.
//   2. Si no tiene, se deriva del nombre (primeros 3 chars alfanuméricos).
//   3. Si el prefijo derivado choca con otro dentro del mismo tenant →
//      se le agrega un sufijo numérico (REC2, REC3...).
//   4. Si aun así no se puede resolver único → ABORTA (no guarda nada).
//
// El script es idempotente: re-ejecutarlo no cambia prefijos ya guardados.
//
// Modos (argv[2]):
//   scan    → SOLO LECTURA: muestra qué prefijos se asignarían
//   apply   → guarda los prefijos en DB (requiere backup previo)
//
// Flags:
//   --tenant <slug>  → procesar solo un tenant (requerido para apply en prod)
//   --db <nombre>    → nombre de base explícito
//   --allow-prod     → override para apuntar a prod (requiere --tenant)
//
// Producción:
//   scan:  MONGODB_URI=... node location-prefix-backfill.mjs scan --allow-prod
//   apply: MONGODB_URI=... node location-prefix-backfill.mjs apply --tenant chopisburger --allow-prod
//          (requiere aprobación previa y backup)
//
// El backup se guarda en ./backups/prefix-backup-<timestamp>.json
// ============================================================================

import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { resolveDbName, guardAgainstProd, PROD_DB_NAME } from './_safety.mjs'

const mode = process.argv[2] ?? 'scan'
const argv = process.argv.slice(3)

function getFlag(name) {
  const idx = argv.indexOf(name)
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : null
}

const tenantSlug = getFlag('--tenant')
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

// En producción: apply requiere --tenant (uno por vez, con aprobación)
if (mode === 'apply') {
  const uriCheck = process.env.MONGODB_URI
  if (uriCheck) {
    const dbCheck = resolveDbName(uriCheck, null)
    if (dbCheck === PROD_DB_NAME) {
      if (!tenantSlug) {
        console.error('BLOQUEADO: apply en producción requiere --tenant <slug> (uno por vez).')
        console.error('Ejemplo: node location-prefix-backfill.mjs apply --tenant chopisburger --allow-prod')
        process.exit(2)
      }
    }
  }
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

/** Deriva prefijo base del nombre (misma lógica que sedePrefix en TS). */
function derivePrefix(name) {
  const clean = String(name).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const prefix = clean.slice(0, 3)
  return prefix.length >= 2 ? prefix : 'LOC'
}

/** Genera prefijo único dentro de un set ya usado, con sufijo numérico. */
function uniquePrefix(base, usedSet) {
  if (!usedSet.has(base)) return base
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base.slice(0, 2)}${i}`
    if (!usedSet.has(candidate)) return candidate
  }
  return null
}

async function main() {
  guardAgainstProd(uri, dbName, argv)
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const effectiveDb = resolveDbName(uri, dbName)
  const db = mongoose.connection.useDb(effectiveDb).db

  const report = { mode, db: effectiveDb, tenantSlug, startedAt: new Date().toISOString() }

  // Filtrar por tenant si se indicó
  let tenantFilter = { isActive: true }
  if (tenantSlug) {
    const tenant = await db.collection('tenants').findOne({ slug: tenantSlug })
    if (!tenant) {
      console.error(`Tenant "${tenantSlug}" no encontrado.`)
      process.exit(1)
    }
    tenantFilter = { ...tenantFilter, tenantId: tenant._id }
    report.tenantId = String(tenant._id)
  }

  const locations = await db.collection('locations').find(tenantFilter).toArray()
  report.locationsScanned = locations.length

  // Agrupar por tenant
  const byTenant = new Map()
  for (const loc of locations) {
    const tid = String(loc.tenantId)
    if (!byTenant.has(tid)) byTenant.set(tid, [])
    byTenant.get(tid).push(loc)
  }

  const assignments = []
  const collisions = []
  let aborted = false

  for (const [tenantId, locs] of byTenant) {
    const usedSet = new Set()
    for (const loc of locs) {
      if (loc.prefix) usedSet.add(loc.prefix)
    }

    for (const loc of locs) {
      if (loc.prefix) {
        assignments.push({
          locationId: String(loc._id),
          name: loc.name,
          tenantId,
          action: 'skip',
          prefix: loc.prefix,
          reason: 'already has prefix',
        })
        continue
      }

      const base = derivePrefix(loc.name)
      const final = uniquePrefix(base, usedSet)

      if (!final) {
        collisions.push({
          locationId: String(loc._id),
          name: loc.name,
          tenantId,
          basePrefix: base,
          reason: 'could not resolve unique prefix',
        })
        aborted = true
        continue
      }

      usedSet.add(final)
      assignments.push({
        locationId: String(loc._id),
        name: loc.name,
        tenantId,
        action: 'assign',
        prefix: final,
        basePrefix: base,
        wasAdjusted: final !== base,
      })
    }
  }

  report.assignments = assignments
  report.toAssign = assignments.filter(a => a.action === 'assign').length
  report.collisions = collisions
  report.aborted = aborted

  if (aborted) {
    console.error('ABORTADO: no se pudieron resolver prefijos únicos para todas las sedes.')
    console.error(JSON.stringify(report, null, 2))
    await mongoose.disconnect()
    process.exit(1)
  }

  if (mode === 'scan') {
    console.log(JSON.stringify(report, null, 2))
    await mongoose.disconnect()
    return
  }

  // ── APPLY ──────────────────────────────────────────────────────────
  // Backup previo: guardar estado actual de las sedes que se van a modificar
  const toAssign = assignments.filter(a => a.action === 'assign')
  if (toAssign.length === 0) {
    console.log(JSON.stringify({ ...report, applyResult: { updated: 0, note: 'nothing to assign' } }, null, 2))
    await mongoose.disconnect()
    return
  }

  const backupDir = path.join(process.cwd(), 'backups')
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(backupDir, `prefix-backup-${timestamp}.json`)

  const backupData = toAssign.map(a => ({
    locationId: a.locationId,
    name: a.name,
    tenantId: a.tenantId,
    prefixBefore: null, // no tenían prefix
    prefixAfter: a.prefix,
  }))
  fs.writeFileSync(backupFile, JSON.stringify({ report, backup: backupData }, null, 2))
  report.backupFile = backupFile

  let updated = 0
  for (const a of toAssign) {
    await db.collection('locations').updateOne(
      { _id: new mongoose.Types.ObjectId(a.locationId) },
      { $set: { prefix: a.prefix } }
    )
    updated++
  }

  report.applyResult = { updated, backupFile }
  console.log(JSON.stringify(report, null, 2))
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
