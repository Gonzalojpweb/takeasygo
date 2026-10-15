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
//   apply   → guarda los prefijos en DB
//
// Uso:
//   MONGODB_URI=... node scripts/audit/location-prefix-backfill.mjs scan
//   MONGODB_URI=... node scripts/audit/location-prefix-backfill.mjs apply
// ============================================================================

import mongoose from 'mongoose'
import { resolveDbName, guardAgainstProd, PROD_DB_NAME } from './_safety.mjs'

const mode = process.argv[2] ?? 'scan'

// En producción SOLO se permite scan (solo lectura). Apply está bloqueado.
if (mode === 'apply') {
  const uriCheck = process.env.MONGODB_URI
  if (uriCheck) {
    const dbCheck = resolveDbName(uriCheck, null)
    if (dbCheck === PROD_DB_NAME) {
      console.error('BLOQUEADO: apply no está permitido en producción (base test).')
      console.error('Usá scan para verificar qué se asignaría.')
      process.exit(2)
    }
  }
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}

const argv = process.argv.slice(3)
const dbArgIdx = argv.indexOf('--db')
const dbName = dbArgIdx >= 0 ? argv[dbArgIdx + 1] : null

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
  return null // no se pudo resolver
}

async function main() {
  guardAgainstProd(uri, dbName, argv)
  await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
  const effectiveDb = resolveDbName(uri, dbName)
  const db = mongoose.connection.useDb(effectiveDb).db

  const report = { mode, db: effectiveDb, startedAt: new Date().toISOString() }

  const locations = await db.collection('locations').find({ isActive: true }).toArray()
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
    // Prefijos ya usados en este tenant (los que ya tienen prefix guardado)
    const usedSet = new Set()
    for (const loc of locs) {
      if (loc.prefix) usedSet.add(loc.prefix)
    }

    for (const loc of locs) {
      // Ya tiene prefix → no se toca
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
  let updated = 0
  for (const a of assignments) {
    if (a.action !== 'assign') continue
    await db.collection('locations').updateOne(
      { _id: new mongoose.Types.ObjectId(a.locationId) },
      { $set: { prefix: a.prefix } }
    )
    updated++
  }

  report.applyResult = { updated }
  console.log(JSON.stringify(report, null, 2))
  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
