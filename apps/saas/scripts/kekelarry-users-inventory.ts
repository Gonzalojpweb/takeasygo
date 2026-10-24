// Inventario (solo lectura) de usuarios back-office del tenant kekelarry.
// Uso: npx tsx scripts/kekelarry-users-inventory.ts
import mongoose from 'mongoose'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '../.env.local') })

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Setear MONGODB_URI (o correr desde .env.local)')
    process.exit(1)
  }
  await mongoose.connect(uri)
  const db = mongoose.connection.db!

  const tenant = await db.collection('tenants').findOne({ slug: 'kekelarry' })
  if (!tenant) {
    console.error('Tenant kekelarry no encontrado')
    process.exit(1)
  }
  const tid = tenant._id
  console.log(`Tenant: ${tenant.name} (${tenant.slug}) _id=${tid}\n`)

  const users = await db
    .collection('users')
    .find({ tenantId: tid })
    .project({ email: 1, name: 1, role: 1, isActive: 1, createdAt: 1, lastLoginAt: 1 })
    .toArray()

  console.log(`Usuarios con tenantId=${tid}: ${users.length}\n`)
  for (const u of users) {
    const keep = u.email === 'kekeylarry@gmail.com' ? '[MANTENER]' : '[BORRAR]'
    console.log(
      `${keep} ${u.email.padEnd(40)} role=${String(u.role).padEnd(18)} active=${u.isActive} lastLogin=${u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().slice(0, 10) : '-'} created=${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '-'}`
    )
  }

  const ids = users.map((u) => u._id)
  const keepUser = users.find((u) => u.email === 'kekeylarry@gmail.com')
  console.log(`\nAdmin a conservar: ${keepUser ? keepUser.email + ' _id=' + keepUser._id : '¡NO ENCONTRADO!'}\n`)

  // Dependencias de esos users
  const ulr = await db.collection('user_location_roles').countDocuments({ userId: { $in: ids }, tenantId: tid })
  const prefs = await db.collection('userpreferences').countDocuments({ userId: { $in: ids } })
  const accounts = await db.collection('accounts').countDocuments({ userId: { $in: ids } })
  const sessions = await db.collection('sessions').countDocuments({ userId: { $in: ids } })
  const pushSubs = await db.collection('pushsubscriptions').countDocuments({ userId: { $in: ids } })

  console.log('Dependencias de esos usuarios:')
  console.log(`  user_location_roles (tenant): ${ulr}`)
  console.log(`  userpreferences:              ${prefs}`)
  console.log(`  accounts (next-auth):         ${accounts}`)
  console.log(`  sessions (next-auth):         ${sessions}`)
  console.log(`  pushsubscriptions:            ${pushSubs}`)

  // ¿Hay superadmins con assignedTenants incluyendo este tenant?
  const superadmins = await db.collection('users').find({ role: 'superadmin', assignedTenants: tid }).project({ email: 1 }).toArray()
  console.log(`\nSuperadmins con assignedTenants=kekelarry: ${superadmins.map((s) => s.email).join(', ') || '(ninguno)'}`)

  await mongoose.disconnect()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
