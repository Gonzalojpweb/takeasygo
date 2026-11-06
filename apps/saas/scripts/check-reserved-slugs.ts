/**
 * scripts/check-reserved-slugs.ts — SOLO LECTURA (multi-marca PR 5)
 *
 * Lista los comercios cuyo slug hoy figura en lib/reserved-slugs.ts o no pasa
 * el formato. No escribe nada: esos comercios conservan su slug (la edición
 * del superadmin solo valida cuando el slug cambia). Sirve para decidir a mano
 * si alguno conviene renombrar.
 *
 * Uso:  npx tsx scripts/check-reserved-slugs.ts [ruta-al-.env]
 *       (por defecto .env.staging; para producción pasar el .env explícito)
 */
import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'
import { RESERVED_SLUGS, TENANT_SLUG_REGEX } from '../lib/reserved-slugs'

config({ path: resolve(__dirname, '..', process.argv[2] ?? '.env.staging') })

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Falta MONGODB_URI')
  await mongoose.connect(uri)
  const tenants = await mongoose.connection.db!
    .collection('tenants')
    .find({}, { projection: { slug: 1, name: 1, isActive: 1 } })
    .toArray()

  const reserved = tenants.filter(t => RESERVED_SLUGS.has(String(t.slug)))
  const badFormat = tenants.filter(t => !TENANT_SLUG_REGEX.test(String(t.slug)))

  console.log(`Base: ${mongoose.connection.name} · comercios: ${tenants.length}`)
  console.log(`\nSlug reservado (${reserved.length}):`)
  for (const t of reserved) console.log(`  - ${t.slug}  «${t.name}»  activo=${t.isActive !== false}`)
  console.log(`\nFormato inválido (${badFormat.length}):`)
  for (const t of badFormat) console.log(`  - ${t.slug}  «${t.name}»  activo=${t.isActive !== false}`)

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
