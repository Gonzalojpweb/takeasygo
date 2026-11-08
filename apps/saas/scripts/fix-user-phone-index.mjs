// ============================================================================
// fix-user-phone-index.mjs — Corrige el índice de User.phone (error 500 en altas)
// ============================================================================
// Problema: phone tenía default null + índice único «sparse» (phone_1). Sparse
// solo ignora documentos SIN el campo, así que dos usuarios con phone: null
// chocaban (E11000) y el alta devolvía error 500.
//
// El modelo ya no guarda null (models/User.ts), así que las altas nuevas no
// chocan aunque phone_1 siga existiendo. Este script deja la base prolija:
//   1. Diagnóstico: índices de phone, usuarios con null / '' y teléfonos repetidos.
//   2. Con --apply:
//      a. Si hay teléfonos repetidos, se detiene sin tocar nada (hay que resolverlos a mano).
//      b. $unset de phone donde es null o ''.
//      c. Crea phone_unique_text (único solo entre teléfonos con texto).
//      d. Borra phone_1.
//
// Uso (desde apps/saas):
//   node scripts/fix-user-phone-index.mjs            → solo diagnóstico
//   node scripts/fix-user-phone-index.mjs --apply    → aplica la corrección
// Toma MONGODB_URI del entorno o de .env.local.
// ============================================================================
import fs from 'node:fs'
import mongoose from 'mongoose'

const APPLY = process.argv.includes('--apply')

function mongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
  const m = env.match(/^MONGODB_URI=(.*)$/m)
  if (!m) throw new Error('Falta MONGODB_URI (entorno o .env.local)')
  return m[1].trim().replace(/^["']|["']$/g, '')
}

await mongoose.connect(mongoUri())
const users = mongoose.connection.db.collection('users')

const phoneIndexes = (await users.indexes()).filter(i => 'phone' in i.key)
const [total, nulls, empties, withPhone] = await Promise.all([
  users.countDocuments({}),
  users.countDocuments({ $expr: { $eq: [{ $type: '$phone' }, 'null'] } }),
  users.countDocuments({ phone: '' }),
  users.countDocuments({ phone: { $gt: '' } }),
])
const duplicates = await users.aggregate([
  { $match: { phone: { $gt: '' } } },
  { $group: { _id: '$phone', n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
]).toArray()

console.log('Índices de phone:')
for (const i of phoneIndexes) console.log(`  · ${i.name}  unique=${!!i.unique} sparse=${!!i.sparse} partial=${JSON.stringify(i.partialFilterExpression ?? null)}`)
console.log(`Usuarios: ${total} · phone null: ${nulls} · phone vacío: ${empties} · con teléfono: ${withPhone} · teléfonos repetidos: ${duplicates.length}`)

if (!APPLY) {
  console.log('\nSolo diagnóstico. Para aplicar: node scripts/fix-user-phone-index.mjs --apply')
  await mongoose.disconnect()
  process.exit(0)
}

if (duplicates.length > 0) {
  console.error(`\nHay ${duplicates.length} teléfonos repetidos entre usuarios: resolvelos antes de crear el índice único. No se tocó nada.`)
  await mongoose.disconnect()
  process.exit(1)
}

const cleaned = await users.updateMany({ $or: [{ phone: null }, { phone: '' }], phone: { $exists: true } }, { $unset: { phone: '' } })
console.log(`\n✓ phone null/vacío quitado en ${cleaned.modifiedCount} usuarios`)

if (!phoneIndexes.some(i => i.name === 'phone_unique_text')) {
  await users.createIndex({ phone: 1 }, { name: 'phone_unique_text', unique: true, partialFilterExpression: { phone: { $gt: '' } } })
  console.log('✓ Índice phone_unique_text creado')
} else {
  console.log('· phone_unique_text ya existía')
}

if (phoneIndexes.some(i => i.name === 'phone_1')) {
  await users.dropIndex('phone_1')
  console.log('✓ Índice viejo phone_1 borrado')
}

await mongoose.disconnect()
console.log('Listo.')
