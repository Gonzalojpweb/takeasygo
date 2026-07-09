/**
 * One-time migration: backfill any Location documents where timezone is null or missing.
 * Run: node apps/saas/scripts/backfill-location-timezone.mjs
 *
 * Prerequisite: MONGODB_URI env var must be set (or .env loaded).
 */
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  console.error('Falta MONGODB_URI en el entorno')
  process.exit(1)
}

const LocationSchema = new mongoose.Schema({}, { strict: false, collection: 'locations' })
const Location = mongoose.model('Location', LocationSchema)

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log('Conectado a MongoDB')

  const result = await Location.updateMany(
    { $or: [{ timezone: null }, { timezone: { $exists: false } }] },
    { $set: { timezone: DEFAULT_TZ } },
  )

  console.log(`Documentos actualizados: ${result.modifiedCount}`)
  await mongoose.disconnect()
  console.log('Listo')
}

main().catch(err => { console.error(err); process.exit(1) })
