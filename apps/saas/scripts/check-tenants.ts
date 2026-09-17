import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.staging') })

const MONGODB_URI = process.env.MONGODB_URI!

async function check() {
  await mongoose.connect(MONGODB_URI)
  const db = mongoose.connection.db
  const result = await db.collection('tenants').find(
    { slug: { $in: ['que-cachapa', 'la-parrilla-de-andy', 'pizza-crash', 'kimi-chino-frito', 'losmuchachosdepuntoybanca'] } },
    { projection: { slug: 1, 'mercadopago.isConfigured': 1, 'mercadopago.accessToken': 1, 'mpAccounts': 1, 'mpOAuth.accessToken': 1 } }
  ).toArray()
  console.log(JSON.stringify(result, null, 2))
  await mongoose.disconnect()
}
check()
