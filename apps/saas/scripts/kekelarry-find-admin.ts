// ¿Existe kekeylarry@gmail.com en algún lado? ¿Esta DB es la correcta?
import mongoose from 'mongoose'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '../.env.local') })

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) { console.error('Sin MONGODB_URI'); process.exit(1) }
  await mongoose.connect(uri)
  const db = mongoose.connection.db!

  console.log('DB name:', db.databaseName)

  // 1. Buscar el email admin en users (cualquier tenant, cualquier forma)
  const variants = ['kekeylarry@gmail.com', 'KEKEYLARRY@GMAIL.COM']
  const byEmail = await db.collection('users').find({ email: { $in: variants } }).project({ email: 1, role: 1, tenantId: 1, assignedTenants: 1, isActive: 1 }).toArray()
  console.log('\nusers con email kekeylarry:', byEmail.length)
  for (const u of byEmail) console.log(JSON.stringify(u))

  // 2. Búsqueda case-insensitive / parcial
  const regex = await db.collection('users').find({ email: /kekeylarry/i }).project({ email: 1, role: 1, tenantId: 1, isActive: 1 }).limit(10).toArray()
  console.log('\nusers email /kekeylarry/i:', regex.length)
  for (const u of regex) console.log(JSON.stringify(u))

  // 3. Usuarios admin del tenant kekelarry (cualquier email)
  const tenant = await db.collection('tenants').findOne({ slug: 'kekelarry' })
  const admins = await db.collection('users').find({ tenantId: tenant._id, role: { $in: ['admin', 'manager'] } }).project({ email: 1, role: 1, isActive: 1 }).toArray()
  console.log('\nadmins/managers del tenant:', admins.length)
  for (const a of admins) console.log(JSON.stringify(a))

  // 4. ¿Cuántos usuarios totales hay? ¿Es producción?
  const total = await db.collection('users').countDocuments()
  const tenants = await db.collection('tenants').countDocuments({ isActive: true })
  console.log(`\nTotales — users: ${total}, tenants activos: ${tenants}`)

  // 5. ¿Cómo se llama el admin real del tenant? (owner/creator)
  console.log('\nTenant kekelarry — campos de owner/creator/admin:')
  const t = await db.collection('tenants').findOne({ slug: 'kekelarry' }, { projection: { ownerEmail: 1, email: 1, contactEmail: 1, createdBy: 1, adminEmail: 1, name: 1, slug: 1 } })
  console.log(JSON.stringify(t, null, 2))

  await mongoose.disconnect()
}

run().catch((e) => { console.error(e); process.exit(1) })
