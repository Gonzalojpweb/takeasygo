/**
 * scripts/fiscal-pos-claims-backfill.ts — registra los puntos de venta
 * actuales en fiscal_pos_claims (multi-marca PR 6).
 *
 * POR DEFECTO SOLO SIMULA: lista qué registraría y los choques (mismo CUIT,
 * ambiente y punto de venta en dos comercios). No escribe nada.
 * Con --apply escribe, solo si no hay choques. En producción se corre con el
 * dueño mirando, después de la simulación y con backup.
 *
 * Hay que correrlo ANTES de poner fiscal.posClaims en enforce: si no, el
 * primer comercio que guarde se queda con un punto de venta que otro ya usa.
 *
 * Uso:  npx tsx scripts/fiscal-pos-claims-backfill.ts [ruta-al-.env] [--apply]
 *       (por defecto .env.staging; producción: .env.local)
 */
import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const envFile = args.find(a => !a.startsWith('--')) ?? '.env.staging'
config({ path: resolve(__dirname, '..', envFile) })

type Pos = { locationId: mongoose.Types.ObjectId; number: number }
type Profile = { tenantId: mongoose.Types.ObjectId; cuit?: string; environment?: string; pointsOfSale?: Pos[]; contingency?: { pointsOfSale?: Pos[] } }

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Falta MONGODB_URI')
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  const db = mongoose.connection.db!
  console.log(`Base: ${mongoose.connection.name} · ${apply ? 'ESCRIBE (--apply)' : 'SIMULACIÓN, no escribe'}`)

  const tenants = new Map((await db.collection('tenants').find({}, { projection: { slug: 1, status: 1 } }).toArray()).map(t => [String(t._id), t]))
  const profiles = await db.collection('fiscalprofiles').find({ cuit: { $nin: ['', null] } }).toArray() as unknown as Profile[]

  const wanted: { cuit: string; environment: string; pointOfSale: number; kind: 'regular' | 'contingency'; tenantId: mongoose.Types.ObjectId; locationId: mongoose.Types.ObjectId }[] = []
  for (const p of profiles) {
    const t = tenants.get(String(p.tenantId))
    if (!t || t.status === 'deleted') continue
    const env = p.environment === 'production' ? 'production' : 'homologation'
    const seen = new Set<number>()
    for (const pos of p.pointsOfSale ?? []) {
      if (seen.has(pos.number)) continue
      seen.add(pos.number)
      wanted.push({ cuit: p.cuit!, environment: env, pointOfSale: pos.number, kind: 'regular', tenantId: p.tenantId, locationId: pos.locationId })
    }
    for (const pos of p.contingency?.pointsOfSale ?? []) {
      if (seen.has(pos.number)) continue
      seen.add(pos.number)
      wanted.push({ cuit: p.cuit!, environment: env, pointOfSale: pos.number, kind: 'contingency', tenantId: p.tenantId, locationId: pos.locationId })
    }
  }

  const byKey = new Map<string, typeof wanted>()
  for (const w of wanted) {
    const k = `${w.cuit}|${w.environment}|${w.pointOfSale}`
    byKey.set(k, [...(byKey.get(k) ?? []), w])
  }
  const conflicts = [...byKey.entries()].filter(([, ws]) => new Set(ws.map(w => String(w.tenantId))).size > 1)
  const existing = await db.collection('fiscal_pos_claims').countDocuments()

  console.log(`Perfiles con CUIT: ${profiles.length} · puntos de venta a registrar: ${wanted.length} · ya registrados: ${existing}`)
  for (const w of wanted) console.log(`   - ${tenants.get(String(w.tenantId))?.slug} · CUIT ${w.cuit} · ${w.environment} · PV ${w.pointOfSale} (${w.kind === 'regular' ? 'factura online' : 'contingencia'})`)
  console.log(`\nChoques (mismo CUIT + ambiente + PV en dos comercios): ${conflicts.length}`)
  for (const [k, ws] of conflicts) console.log(`   ⚠ ${k} · ${ws.map(w => tenants.get(String(w.tenantId))?.slug).join(' | ')}`)

  if (!apply) {
    console.log('\nSimulación terminada. Para escribir: agregar --apply (sin choques).')
  } else if (conflicts.length) {
    console.log('\nNO se escribió nada: primero hay que resolver los choques.')
    process.exitCode = 2
  } else {
    const col = db.collection('fiscal_pos_claims')
    await col.createIndex({ cuit: 1, environment: 1, pointOfSale: 1 }, { unique: true, name: 'uniq_cuit_env_pos' })
    await col.createIndex({ tenantId: 1 })
    let inserted = 0
    for (const w of wanted) {
      const r = await col.updateOne(
        { cuit: w.cuit, environment: w.environment, pointOfSale: w.pointOfSale },
        { $setOnInsert: { ...w, createdAt: new Date(), updatedAt: new Date() } },
        { upsert: true },
      )
      if (r.upsertedCount) inserted++
    }
    console.log(`\nRegistrados: ${inserted} nuevos (los ya existentes no se tocaron).`)
  }
  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
