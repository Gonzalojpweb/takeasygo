#!/usr/bin/env node
// Temp: crea un admin de palmyra con bcrypt correcto para verificar el hotfix.
// Borrado por mp-hotfix-live-verify.mjs. STAGING ONLY.
import mongoose from 'mongoose'
import { randomBytes } from 'node:crypto'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'
import * as bcrypt from 'bcryptjs'

const uri = process.env.MONGODB_URI
const effective = resolveDbName(uri, null)
if (effective !== 'takeasygo-staging') {
  guardAgainstProd(uri, null)
  process.exit(2)
}
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db
const tenants = await db.collection('tenants').find({ slug: { $in: ['palmyra', 'lacasetta-focaccia'] } }).toArray()
const palmyra = tenants.find((t) => t.slug === 'palmyra')
const lacasetta = tenants.find((t) => t.slug === 'lacasetta-focaccia')

const specs = [
  { tag: 'admin-palmyra', role: 'admin', tenantId: palmyra._id },
  { tag: 'admin-lacasetta', role: 'admin', tenantId: lacasetta._id },
  { tag: 'waiter-palmyra', role: 'waiter', tenantId: palmyra._id },
]
const out = {}
for (const s of specs) {
  const email = `mp-verify-${s.tag}-${randomBytes(3).toString('hex')}@e2e.test`
  const password = `Vf-${randomBytes(18).toString('base64url')}`
  await db.collection('users').insertOne({
    email,
    name: `MP VERIFY ${s.tag}`,
    password: await bcrypt.hash(password, 10),
    role: s.role,
    tenantId: s.tenantId,
    assignedLocations: [],
    assignedTenants: [],
    isActive: true,
    createdAt: new Date(),
  })
  out[s.tag] = { email, password }
}
console.log(JSON.stringify(out))
await mongoose.disconnect()
